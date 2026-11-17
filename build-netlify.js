const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const output = path.join(root, 'dist');
const publicFiles = ['index.html', 'script.js', 'style.css', 'admin.css'];

fs.mkdirSync(output, { recursive: true });
const legacyAdminPage = path.join(output, 'admin.html');
if (fs.existsSync(legacyAdminPage)) fs.unlinkSync(legacyAdminPage);
publicFiles.forEach((file) => {
    fs.copyFileSync(path.join(root, file), path.join(output, file));
});
fs.cpSync(path.join(root, 'imagens'), path.join(output, 'imagens'), { recursive: true });
