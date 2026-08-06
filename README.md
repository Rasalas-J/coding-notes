# 编程笔记 | Dev Notes

个人编程学习笔记与项目记录网站。

## 功能

- 📝 创建学习笔记和项目记录（支持 Markdown）
- 📅 按日期查看 / 🏷️ 按分类查看
- 🖼️ 插入图片（粘贴/拖拽/上传）和文件附件
- 💻 代码语法高亮
- ✏️ 在线编辑模式
- 🔒 仅管理员可编辑，访客只读
- 📱 响应式设计，支持所有设备

## 技术栈

- 纯 HTML/CSS/JS，零构建
- GitHub Pages 托管
- GitHub REST API 实现数据读写
- marked.js + highlight.js + DOMPurify

## 数据存储

所有笔记数据存储在 `data/notes.json`，上传的图片和文件存储在 `data/uploads/` 目录。

## License

MIT
