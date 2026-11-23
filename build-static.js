const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const output = path.join(root, 'dist');
const publicFiles = [
    'index.html',
    'script.js',
    'style.css',
    'admin.css',
    'manifest.webmanifest',
    'service-worker.js'
];

module.exports = function buildStatic(backend) {
    fs.mkdirSync(output, { recursive: true });
    const legacyAdminPage = path.join(output, 'admin.html');
    if (fs.existsSync(legacyAdminPage)) fs.unlinkSync(legacyAdminPage);

    publicFiles.forEach((file) => {
        const source = path.join(root, file);
        const destination = path.join(output, file);
        if (file === 'index.html') {
            const html = fs.readFileSync(source, 'utf8').replace(
                /name="techagenda-backend" content="netlify"/,
                `name="techagenda-backend" content="${backend}"`
            );
            fs.writeFileSync(destination, html);
            return;
        }
        fs.copyFileSync(source, destination);
    });
    fs.cpSync(path.join(root, 'imagens'), path.join(output, 'imagens'), { recursive: true });
};
