// electron-builder afterPack 钩子：在打进安装包之前删掉 app-update.yml
// 背景：electron-builder 检测到 GitHub remote 会自动推断 publish 源并生成
// resources/app-update.yml（供 electron-updater 使用）。本项目不装 electron-updater，
// 留着它反而会让某些环境报 "Cannot find module 'electron-updater'"。
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
  const resDir = path.join(context.appOutDir, 'resources');
  const target = path.join(resDir, 'app-update.yml');
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    console.log('[afterPack] 已删除 ' + path.relative(process.cwd(), target));
  }
  // latest.yml 同理（更新元数据，本项目用不到）
  const latest = path.join(path.dirname(context.appOutDir), 'latest.yml');
  if (fs.existsSync(latest)) {
    fs.unlinkSync(latest);
    console.log('[afterPack] 已删除 latest.yml');
  }
};
