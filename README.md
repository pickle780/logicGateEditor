# Logic Gate Editor

一个基于原生 JavaScript / HTML / CSS 实现的可视化逻辑门电路编辑器。  
你可以在画布中拖拽逻辑门、连接端口、查看真值探针、导入导出电路 JSON，并通过模板功能复用已有电路结构。

## 在线体验

项目已部署到 GitHub Pages 和 Cloudflare Pages，可以直接打开体验：

- Cloudflare Pages: [https://pickle-editor.pages.dev/](https://pickle-editor.pages.dev/)
- GitHub Pages: [https://pickle780.github.io/logicGateEditor/](https://pickle780.github.io/logicGateEditor/)

## 项目简介

Logic Gate Editor 是一个用于可视化编辑数字逻辑电路的小工具。  
它提供了一个网格画布，支持放置输入、输出以及常见逻辑门，并通过连线构建组合逻辑电路。

当前版本为纯前端实现，无需后端服务，也不依赖复杂构建工具。打开 `index.html` 即可运行。

## 主要功能

### 逻辑门编辑

支持以下基础组件：

- `input`
- `output`
- `and`
- `or`
- `xor`
- `not`
- `nand`
- `nor`

你可以通过左侧组件面板添加节点，也可以将组件拖拽到画布中。

### 可视化连线

每个节点拥有输入端口和输出端口。  
点击输出端口后，再点击目标输入端口即可建立连接。

支持的操作包括：

- 点击端口创建连线
- 右键端口断开连接
- 点击连线选中
- 双击或右键连线删除
- 拖拽节点移动位置

### 画布操作

编辑器支持较大的自由画布区域，并提供基础视图控制：

- 鼠标滚轮缩放
- `W / A / S / D` 移动画布视图
- 空格键按住拖动画布
- 自动布局
- 重置视图
- 适应画布
- 自定义画布宽高
- 一键扩展画布

### 多选与复制粘贴

支持框选多个节点，并对多个节点进行整体操作：

- 框选节点
- 拖动选中节点组
- `Ctrl + C` 复制
- `Ctrl + V` 粘贴
- 粘贴时显示预览位置
- `Esc` 取消当前操作

### 真值探针

编辑器会根据输入节点自动生成每个节点的 01 探针序列，用于观察逻辑输出。

支持：

- 显示全部节点探针
- 显示选中节点探针
- 高亮与选中节点真值相同的节点
- 按 01 序列搜索节点
- 点击探针复制内容
- 选中节点后复制该节点探针

### Mask 提取统计

项目内置了 Mask 提取统计功能，可以对节点真值探针进行筛选和聚合分析。

支持：

- 输入 Mask 提取探针的指定位置
- 设置统计数量范围
- 查看提取结果分组
- 展开查看节点明细
- 高亮同提取结果节点
- 高亮同原始探针节点
- 定位节点
- 导出 CSV

### 导入与导出

支持将当前电路导出为 JSON，也可以从 JSON 导入电路。

可用功能包括：

- 复制导出 JSON
- 下载导出 JSON
- 保存完整画布 JSON
- 从文件载入画布
- 从 JSON 导入为电路片段
- 从 JSON 导入为模板

### 模板与替换

编辑器支持将当前电路保存为模板，并使用模板替换已有节点。

这对于构建更复杂的组合逻辑非常有用，例如：

- 用 NAND 门实现 XOR
- 将某个简单逻辑门替换为等价子电路
- 复用常见逻辑结构

内置示例包括：

- Demo 电路
- 普通门示例
- 4 NAND XOR 示例

## 快捷键

| 操作 | 快捷键 / 鼠标 |
| --- | --- |
| 缩放画布 | 鼠标滚轮 |
| 移动画布视图 | `W / A / S / D` |
| 快速移动视图 | `Shift + W / A / S / D` |
| 拖动画布 | 按住空格键后拖动 |
| 复制选中节点 | `Ctrl + C` |
| 粘贴节点 | `Ctrl + V` |
| 删除选中节点或连线 | `Delete` / `Backspace` |
| 取消当前操作 | `Esc` |
| 连接端口 | 点击输出端口，再点击输入端口 |
| 删除连线 | 双击连线或右键连线 |
| 断开端口 | 右键端口 |

## 使用方法

### 在线使用

直接访问任一在线地址：

- [https://pickle-editor.pages.dev/](https://pickle-editor.pages.dev/)
- [https://pickle780.github.io/logicGateEditor/](https://pickle780.github.io/logicGateEditor/)

页面加载后会自动打开一个 Demo 电路。

### 本地运行

克隆仓库：

```bash
git clone https://github.com/pickle780/logicGateEditor.git
cd logicGateEditor
```

然后直接用浏览器打开：

```bash
index.html
```

也可以使用任意静态服务器运行，例如：

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080
```

## 项目结构

```text
logicGateEditor/
├── index.html    # 页面结构
├── style.css     # 样式文件
├── app.js        # 编辑器核心逻辑
├── LICENSE       # 开源协议
└── README.md     # 项目说明
```

## 数据格式

导出的电路数据为 JSON 格式，主要包含：

```json
{
  "folder": "circuit",
  "version": 13,
  "canvas": {
    "width": 2200,
    "height": 1400
  },
  "view": {
    "x": 40,
    "y": 40,
    "scale": 1
  },
  "nodes": [],
  "wires": []
}
```

其中：

- `nodes` 保存所有逻辑节点的位置、类型和名称
- `wires` 保存节点之间的连接关系
- `canvas` 保存画布尺寸
- `view` 保存当前视图位置和缩放比例

## 技术栈

- HTML
- CSS
- JavaScript
- SVG

项目不依赖前端框架，所有交互逻辑均由原生 JavaScript 实现。

## 适用场景

这个项目适合用于：

- 学习数字逻辑电路
- 可视化组合逻辑设计
- 观察逻辑门真值变化
- 构建和保存简单电路
- 演示逻辑门之间的等价替换
- 分析节点真值探针

## 后续计划

未来可以考虑继续扩展：

- 支持更多逻辑元件
- 支持输入节点手动赋值并进行实时仿真
- 支持撤销 / 重做
- 支持电路分组
- 支持子电路封装
- 支持更完善的文件管理
- 支持更复杂的布局算法
- 支持移动端适配

## 许可证

本项目基于 MIT License 开源。

详情请查看 [LICENSE](./LICENSE)。

## 作者

Created by [pickle780](https://github.com/pickle780)
