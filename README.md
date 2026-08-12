npm# 贵州 3D 展厅（React + react-three-fiber）

一个可运行的最小 3D 展厅骨架：**程序化搭建场景 → 漫游 → 热点 → 点击交互**。
不依赖任何外部模型即可跑起来；之后把 Figma 设计稿导出为 GLB / 贴图，再替换进去。

技术栈：`react` + `@react-three/fiber`(R3F) + `@react-three/drei` + `three` + `antd` + `tailwindcss`。

---

## 快速开始

```bash
npm install
npm run dev      # 打开 http://localhost:5173
npm run build    # 生产构建
```

两种交互模式（右上角切换）：

- **观察模式（默认）**：鼠标左键旋转、滚轮缩放、右键平移；**点击热点**（小球或标签）查看详情。
- **漫游模式**：点“点击开始漫游”锁定鼠标 → `WASD` 移动、鼠标控制视角、`Shift` 加速；
  把**准星对准热点按 `E`** 查看详情，`Esc` 解锁鼠标。

---

## 先搞懂 5 个核心概念

Three.js（以及 R3F）的世界观其实很简单，三件套 + 五个名词。

### 1. 三件套：场景 / 相机 / 渲染器

> **“你拿着一台相机，站在一个场景里，渲染器负责把你看到的拍下来显示到屏幕上。”**

| 概念 | 作用 | 在本项目的位置 |
| --- | --- | --- |
| **Scene 场景** | 一个容器，装下所有要显示的物体、灯光 | `<Canvas>` 自动创建，你往里面放东西即可 |
| **Camera 相机** | 决定“从哪个角度、多大视野看”。常用透视相机 `PerspectiveCamera`（有近大远小） | `<Canvas camera={{ fov: 60, position: [...] }}>` |
| **Renderer 渲染器** | 把场景+相机计算成每一帧的 2D 图像（`WebGLRenderer`，走 GPU） | `<Canvas>` 自动创建，每帧自动渲染 |

`react-three-fiber` 帮你把上面三件事都自动化了——你只写 `<Canvas>` 和里面的物体。

### 2. 物体：几何体 / 材质 / 贴图 / 网格

这是被问到的那几个词，记住一个公式：

> **Mesh（网格） = Geometry（几何体） + Material（材质）**
> **Material（材质） 里可以再贴 Texture（贴图）**

| 名词 | 是什么 | 决定了… | 代码示例 |
| --- | --- | --- | --- |
| **Geometry 几何体** | 形状的“骨架”：一组顶点和面 | **长什么样**（方、圆、人…) | `<boxGeometry/>` `<sphereGeometry/>` `<planeGeometry/>` |
| **Material 材质** | 表面的“皮肤” | **质感**（颜色、粗糙度、金属感、是否反光） | `<meshStandardMaterial color="#fff" roughness={0.5}/>` |
| **Texture 贴图** | 一张图，贴在材质表面 | **表面细节**（木纹、砖缝、Logo、画） | `new THREE.TextureLoader().load('/x.jpg')` 给到 `<meshStandardMaterial map={tex}/>` |
| **Mesh 网格** | 几何体+材质合体后的**可见物体** | 在场景里真正能被看到、能移动、能点 | `<mesh>...</mesh>` |

一句话区分：**几何体管“形”，材质管“面”，贴图管“面上的花纹”，网格是这三者的打包。**

本项目里你能在 `src/experience/Hall.jsx` 同时看到它们：

```jsx
<mesh rotation={[-Math.PI/2,0,0]} receiveShadow>
  <planeGeometry args={[width, depth]} />              {/* Geometry：一块平面 */}
  <meshStandardMaterial map={floorTex} roughness={0.85} metalness={0.05} /> {/* Material + 贴图 */}
</mesh>
```

`floorTex` 是用 Canvas 临时画的方格图（`useFloorTexture`），演示“贴图”概念；
真实项目里换成 `new THREE.TextureLoader().load('/textures/floor.jpg')` 即可。

### 3. 灯光（Light）

> **受光材质（MeshStandardMaterial）必须有光才看得见，否则一片黑。**

常见灯光（见 `src/experience/Lights.jsx`）：

| 灯 | 像什么 | 用途 |
| --- | --- | --- |
| `ambientLight` | 整体均匀的环境亮 | 抬高暗部，别让阴影死黑 |
| `hemisphereLight` | 天与地两色的渐变光 | 模拟天空与地面反射，比 ambient 自然 |
| `directionalLight` | 太阳 / 主灯，平行光 | 主光源，**可投影**（`castShadow`） |
| `pointLight` | 灯泡，向四面八方 | 展台射灯、氛围光（有 `distance`/`color`） |
| `spotLight` | 手电筒，锥形光 | 聚光打在某件展品上 |

关键参数：`intensity`（亮度）、`color`（颜色）、`castShadow`（是否投影，只有主灯开，性能贵）、
`distance/decay`（衰减）。想看到阴影，还要：开 `<Canvas shadows>`、灯光 `castShadow`、
物体 `castShadow`/`receiveShadow`——本项目都已配好，直接改参数观察变化即可。

---

## 项目结构

```
src/
├── main.jsx                 # 入口：antd 暗色主题 + 中文
├── App.jsx                  # 状态总控：模式 / 选中热点 / 锁定 / 准星焦点
├── index.css                # Tailwind v4 + 全局样式 + 热点/准星样式
├── data/
│   ├── config.js            # 展厅尺寸、漫游参数、可选 modelUrl
│   └── hotspots.js          # 热点数据（位置/标题/描述）
├── experience/              # ===== 3D 层（R3F）=====
│   ├── Experience.jsx       # <Canvas>：场景/相机/渲染器 + 模式切换
│   ├── Lights.jsx           # 全部灯光
│   ├── Hall.jsx             # 程序化展厅（几何体+材质+贴图演示）
│   ├── Hotspot.jsx          # 热点：发光球 + 标签 + 点击/E 交互
│   ├── Player.jsx           # 第一人称漫游：PointerLock + WASD + 准星射线
│   └── GltfModel.jsx        # 可选：加载 .glb 模型
└── ui/                      # ===== 2D 层（antd + Tailwind）=====
    ├── TopBar.jsx           # 标题 + 模式切换 + 热点数
    ├── HotspotDrawer.jsx    # 热点详情抽屉
    ├── RoamOverlay.jsx      # “点击开始漫游”遮罩
    └── Hud.jsx              # 准星 + 底部操作提示
```

---

## 怎么换成真实场景（Figma → 这里）

Figma 的设计稿需要先导出成 3D 能用的资源，流程一般是：

1. **展厅模型**：在 Blender / 根据 Figma 尺寸建模，导出 **`.glb`**（含贴图的二进制 glTF，最省心）。
   放到 `public/models/hall.glb`。
2. 改一行：`src/data/config.js` → `modelUrl: '/models/hall.glb'`。
   `Experience.jsx` 会自动用真实模型替代程序化 `Hall`。
3. **热点位置**：对照模型里展品的坐标，改 `src/data/hotspots.js` 里的 `position`。
   （坐标可在 Blender 里读，或在观察模式里估算。）
4. **贴图替换**：把 `Hall.jsx` 里的 `useFloorTexture` 换成 `TextureLoader().load(...)`，
   或直接在建模阶段把贴图烘焙进 `.glb`。
5. **热点图文**：把 `hotspots.js` 里的 `description`、`HotspotDrawer.jsx` 里的占位图换成真实文案/图片。

> 提示：Figma 本身没有可直接导出 glTF 的官方能力，需要借助插件（如“gltf export”）或
> 把 Figma 当作**视觉参考**，在 Blender 里照着建。模型才是 three.js 这边的“数据源”。

---

## 交互是怎么实现的（要点）

- **热点点击**：R3F 给每个 `<mesh>` 提供了 `onClick` / `onPointerOver` 事件，背后是**射线检测**
  （从鼠标位置向场景投射线，命中谁就是点谁）。见 `Hotspot.jsx`。
- **漫游**：`PointerLockControls`（drei）锁定鼠标后用鼠标控制视角；`WASD` 在 `Player.jsx` 的
  `useFrame` 里每帧沿视角方向移动相机。`useFrame` 是 R3F 的“每帧钩子”。
- **准星 + E**：漫游时鼠标被锁定没法点。于是在 `useFrame` 里用 `Raycaster` 从**屏幕中心**
  向场景投射线，命中热点且 5 米内 → 视为“正在注视”，按 `E` 打开详情。

---

## 后续可做的事（路线图）

- 用真实 GLB 替换程序化展厅，按展品位置布点
- 贴图：地面/墙面/展品图，加上法线/粗糙度贴图提升质感
- 环境：drei `<Environment preset="..."/>` 做 PBR 反射，`<ContactShadows>` 软阴影
- 相机飞行动画：点击导航菜单让相机平滑飞到某展品前（drei `<CameraControls>`）
- 音频/视频：展品旁加 `<PositionalAudio>` 或视频贴图
- 性能：大模型用 `Suspense` + `<Progress>` 预加载、`InstancedMesh` 批量、按视距显隐
- 打包：生产构建 three 体积大，用动态 `import()` 拆 chunk、加加载进度

---

## 常见坑

- **React 19 / R3F 9 / drei 10 / three 0.185** 必须配套，本项目已锁版本。升级时一起升。
- **一片黑**：99% 是没灯光，或用了受光材质却没光。先加 `<ambientLight/>` 排查。
- **看不到贴图**：贴图路径不对（要放 `public/`，用绝对 `/...` 路径），或没给到 `map`。
- **JSX 里 `<mesh>` 不报错但想用 TS**：R3F v9 的类型在 `@react-three/fiber`，按需引入即可。
