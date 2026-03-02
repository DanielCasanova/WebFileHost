import express from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import multer from "multer";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

const DATA_FILE = "./data/metadata.json";
const USERS_FILE = process.env.USERS_FILE || "/etc/fileapp/users.json";
const UPLOAD_DIR = "./uploads";

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ files: [], groups: [] }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: "replace-with-random-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// Rate limiters
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const groupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).send("Unauthorized");
  next();
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const id = uuidv4();
    cb(null, id + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// LOGIN
app.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE));

  const user = users[username];
  if (!user) return res.status(401).send("Invalid");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).send("Invalid");

  req.session.user = username;
  res.sendStatus(200);
});

// UPLOAD
app.post("/upload", requireAuth, upload.single("file"), (req, res) => {
  const data = loadData();
  const fileId = uuidv4();

  data.files.push({
    id: fileId,
    owner: req.session.user,
    originalName: req.file.originalname,
    storedName: req.file.filename,
    groups: []
  });

  saveData(data);
  res.sendStatus(200);
});

// CREATE GROUP
app.post("/groups", requireAuth, async (req, res) => {
  const { codename, password } = req.body;
  const data = loadData();

  const hash = await bcrypt.hash(password, 10);

  data.groups.push({
    id: uuidv4(),
    owner: req.session.user,
    codename,
    passwordHash: hash,
    files: []
  });

  saveData(data);
  res.sendStatus(200);
});

// ADD FILE TO GROUP
app.post("/groups/:groupId/add/:fileId", requireAuth, (req, res) => {
  const data = loadData();
  const group = data.groups.find(g => g.id === req.params.groupId && g.owner === req.session.user);
  const file = data.files.find(f => f.id === req.params.fileId && f.owner === req.session.user);

  if (!group || !file) return res.sendStatus(403);

  group.files.push(file.id);
  file.groups.push(group.id);

  saveData(data);
  res.sendStatus(200);
});

// GROUP ACCESS (non user)
app.post("/group-access", groupLimiter, async (req, res) => {
  const { codename, password } = req.body;
  const data = loadData();

  const group = data.groups.find(g => g.codename === codename);
  if (!group) return res.status(403).send("Invalid");

  const valid = await bcrypt.compare(password, group.passwordHash);
  if (!valid) return res.status(403).send("Invalid");

  const files = group.files.map(fid => {
    const f = data.files.find(x => x.id === fid);
    return { id: f.id, name: f.originalName };
  });

  res.json({ groupId: group.id, files });
});

// DOWNLOAD FILE (group access)
app.get("/download/:fileId/:groupId", (req, res) => {
  const data = loadData();
  const { fileId, groupId } = req.params;

  const group = data.groups.find(g => g.id === groupId);
  if (!group || !group.files.includes(fileId)) return res.sendStatus(403);

  const file = data.files.find(f => f.id === fileId);
  if (!file) return res.sendStatus(404);

  res.download(path.join(UPLOAD_DIR, file.storedName), file.originalName);
});

app.get("/", (req, res) => {
  res.sendFile(path.resolve("public/login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.resolve("public/login.html"));
});

app.get("/manage", requireAuth, (req, res) => {
  res.sendFile(path.resolve("public/manage.html"));
});

app.get("/download", (req, res) => {
  res.sendFile(path.resolve("public/download.html"));
});

app.get("/my-data", requireAuth, (req, res) => {
  const data = loadData();

  const files = data.files.filter(f => f.owner === req.session.user);
  const groups = data.groups.filter(g => g.owner === req.session.user);

  res.json({ files, groups });
});

app.delete("/files/:fileId", requireAuth, (req, res) => {
  const data = loadData();
  const fileIndex = data.files.findIndex(
    f => f.id === req.params.fileId && f.owner === req.session.user
  );

  if (fileIndex === -1) return res.sendStatus(403);

  const file = data.files[fileIndex];

  // Remove from groups
  data.groups.forEach(g => {
    g.files = g.files.filter(fid => fid !== file.id);
  });

  // Remove physical file
  fs.unlinkSync(path.join(UPLOAD_DIR, file.storedName));

  data.files.splice(fileIndex, 1);
  saveData(data);

  res.sendStatus(200);
});

app.delete("/groups/:groupId", requireAuth, (req, res) => {
  const data = loadData();

  const groupIndex = data.groups.findIndex(
    g => g.id === req.params.groupId && g.owner === req.session.user
  );

  if (groupIndex === -1) return res.sendStatus(403);

  const group = data.groups[groupIndex];

  // Remove group from files
  data.files.forEach(f => {
    f.groups = f.groups.filter(gid => gid !== group.id);
  });

  data.groups.splice(groupIndex, 1);
  saveData(data);

  res.sendStatus(200);
});

app.post("/groups/:groupId/add-file/:fileId", requireAuth, (req, res) => {
  const data = loadData();

  const group = data.groups.find(
    g => g.id === req.params.groupId && g.owner === req.session.user
  );

  const file = data.files.find(
    f => f.id === req.params.fileId && f.owner === req.session.user
  );

  if (!group || !file) return res.sendStatus(403);

  if (!group.files.includes(file.id)) {
    group.files.push(file.id);
  }

  if (!file.groups.includes(group.id)) {
    file.groups.push(group.id);
  }

  saveData(data);
  res.sendStatus(200);
});

app.post("/groups/:groupId/remove-file/:fileId", requireAuth, (req, res) => {
  const data = loadData();

  const group = data.groups.find(
    g => g.id === req.params.groupId && g.owner === req.session.user
  );

  const file = data.files.find(
    f => f.id === req.params.fileId && f.owner === req.session.user
  );

  if (!group || !file) return res.sendStatus(403);

  group.files = group.files.filter(fid => fid !== file.id);
  file.groups = file.groups.filter(gid => gid !== group.id);

  saveData(data);
  res.sendStatus(200);
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.sendStatus(200);
  });
});

app.listen(PORT, () => console.log("Running on port", PORT));