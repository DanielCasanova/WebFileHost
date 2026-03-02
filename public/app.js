async function login() {
  const username = document.getElementById("user").value;
  const password = document.getElementById("pass").value;

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (res.ok) {
    window.location = "/manage";
  } else {
    alert("Invalid credentials");
  }
}

async function accessGroup() {
  const codename = document.getElementById("code").value;
  const password = document.getElementById("pass").value;

  const res = await fetch("/group-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codename, password })
  });

  if (!res.ok) {
    alert("Invalid codename or password");
    return;
  }

  const data = await res.json();
  const container = document.getElementById("files");
  container.innerHTML = "";

  data.files.forEach(file => {
    const link = document.createElement("a");
    link.href = `/download/${file.id}/${data.groupId}`;
    link.innerText = file.name;
    link.style.display = "block";
    container.appendChild(link);
  });
}

async function upload() {
  const fileInput = document.getElementById("file");
  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  const res = await fetch("/upload", {
    method: "POST",
    body: formData
  });

  if (res.ok) {
    alert("Upload successful");
  } else {
    alert("Upload failed");
  }
}

async function loadData() {
  const res = await fetch("/my-data");
  if (!res.ok) {
    window.location = "/login";
    return;
  }

  const data = await res.json();

  const fileList = document.getElementById("fileList");
  const groupList = document.getElementById("groupList");

  fileList.innerHTML = "";
  groupList.innerHTML = "";

  // FILES
  data.files.forEach(file => {
    const div = document.createElement("div");

    const groupButtons = data.groups.map(group => {
      const inGroup = file.groups.includes(group.id);

      return `
        <button onclick="${inGroup 
          ? `removeFromGroup('${group.id}','${file.id}')`
          : `addToGroup('${group.id}','${file.id}')`}">
          ${inGroup ? `Remove from ${group.codename}` : `Add to ${group.codename}`}
        </button>
      `;
    }).join("");

    div.innerHTML = `
      <strong>${file.originalName}</strong>
      <button onclick="deleteFile('${file.id}')">Delete</button>
      <div style="margin-left:10px">${groupButtons}</div>
      <hr>
    `;

    fileList.appendChild(div);
  });

  // GROUPS
  data.groups.forEach(group => {
    const div = document.createElement("div");

    const filesInGroup = data.files
      .filter(f => f.groups.includes(group.id))
      .map(f => f.originalName)
      .join(", ");

    div.innerHTML = `
      <strong>${group.codename}</strong>
      <button onclick="deleteGroup('${group.id}')">Delete</button>
      <div>Files: ${filesInGroup || "None"}</div>
      <hr>
    `;

    groupList.appendChild(div);
  });
}

async function createGroup() {
  const codename = document.getElementById("groupName").value;
  const password = document.getElementById("groupPass").value;

  const res = await fetch("/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codename, password })
  });

  if (res.ok) {
    loadData();
  } else {
    alert("Failed");
  }
}

async function deleteFile(id) {
  await fetch("/files/" + id, { method: "DELETE" });
  loadData();
}

async function deleteGroup(id) {
  await fetch("/groups/" + id, { method: "DELETE" });
  loadData();
}

async function addToGroup(groupId, fileId) {
  await fetch(`/groups/${groupId}/add-file/${fileId}`, { method: "POST" });
  loadData();
}

async function removeFromGroup(groupId, fileId) {
  await fetch(`/groups/${groupId}/remove-file/${fileId}`, { method: "POST" });
  loadData();
}

async function logout() {
  await fetch("/logout", { method: "POST" });
  window.location = "/login";
}