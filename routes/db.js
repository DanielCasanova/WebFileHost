'use strict';

const fs     = require('fs');
const config = require('../config');

function readFiles()       { return JSON.parse(fs.readFileSync(config.FILES_DB,  'utf8')); }
function writeFiles(data)  { fs.writeFileSync(config.FILES_DB,  JSON.stringify(data, null, 2)); }
function readGroups()      { return JSON.parse(fs.readFileSync(config.GROUPS_DB, 'utf8')); }
function writeGroups(data) { fs.writeFileSync(config.GROUPS_DB, JSON.stringify(data, null, 2)); }

module.exports = { readFiles, writeFiles, readGroups, writeGroups };
