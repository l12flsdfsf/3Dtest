/**
 * 轻量内联 SVG 图标（项目未安装 @ant-design/icons，用简易 SVG 替代）。
 * 每个图标接受标准 SVG 属性，默认 1em × 1em，跟随 font-size 缩放。
 */

function Svg({ children, ...props }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function CompassOutlined(props) {
  return (
    <Svg {...props}>
      <path d="M512 64a448 448 0 1 0 0 896 448 448 0 0 0 0-896zm0 832a384 384 0 1 1 0-768 384 384 0 0 1 0 768zm107.9-527.6L438.6 453.1a64 64 0 0 0-34.5 41.8l-57.7 215.3a16 16 0 0 0 19.5 19.5l215.3-57.7a64 64 0 0 0 41.8-34.5l84.7-181.3a12.8 12.8 0 0 0-17.3-17.3zM512 560a48 48 0 1 1 0-96 48 48 0 0 1 0 96z" />
    </Svg>
  )
}

export function EnvironmentOutlined(props) {
  return (
    <Svg {...props}>
      <path d="M512 64C335 64 192 207 192 384c0 256 320 576 320 576s320-320 320-576C832 207 689 64 512 64zm0 448a128 128 0 1 1 0-256 128 128 0 0 1 0 256z" />
    </Svg>
  )
}

export function EyeOutlined(props) {
  return (
    <Svg {...props}>
      <path d="M512 192c-212 0-384 128-448 320 64 192 236 320 448 320s384-128 448-320c-64-192-236-320-448-320zm0 512a192 192 0 1 1 0-384 192 192 0 0 1 0 384zm0-320a128 128 0 1 0 0 256 128 128 0 0 0 0-256z" />
    </Svg>
  )
}

export function PlayCircleOutlined(props) {
  return (
    <Svg {...props}>
      <path d="M512 64a448 448 0 1 0 0 896 448 448 0 0 0 0-896zm0 832a384 384 0 1 1 0-768 384 384 0 0 1 0 768zm-48-549.3v274.6c0 16.4 18 26.4 32 17.3l214.7-137.3c12.3-7.9 12.3-26.7 0-34.6L496 265.4c-14-9.1-32 .9-32 17.3z" />
    </Svg>
  )
}
