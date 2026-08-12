import { Button, Modal } from 'antd'
import { RAW_FIGMA_EXPORTS } from '../data/assets.js'

const HELP_LINES = [
  '\u901a\u8fc7\u952e\u76d8 W / S / A / D \u952e\u8fdb\u884c\u524d\u8fdb\u3001\u540e\u9000\u3001\u5de6\u65cb\u8f6c\u3001\u53f3\u65cb\u8f6c\u3002',
  '\u9f20\u6807\u5de6\u952e\u70b9\u51fb\u9009\u9879\u8fdb\u884c\u9009\u62e9\u64cd\u4f5c\uff0c\u9f20\u6807\u53f3\u952e\u65cb\u8f6c\u89c6\u89d2\u3002',
  '\u865a\u62df\u5c55\u5385\u5185\u89c6\u9891\u53ca\u56fe\u7247\u8d44\u6599\u6765\u6e90\u7f51\u7edc\uff0c\u6b64\u5904\u4ec5\u4f9b\u6559\u5b66\u4f7f\u7528\u3002',
]

const STEP_ROWS = [
  { top: '51.85%', height: '8.50%' },
  { top: '62.95%', height: '8.50%' },
  { top: '74.05%', height: '8.50%' },
]

export function HelpOverlay({ open, onClose }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      destroyOnClose
      rootClassName="hotspot-modal"
      title={null}
    >
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[28px] border border-slate-200 shadow-[0_26px_80px_rgba(15,23,42,0.18)]">
          <img
            src={RAW_FIGMA_EXPORTS.cPanel1}
            alt={'\u64cd\u4f5c\u5e2e\u52a9\u80cc\u666f\u56fe'}
            className="block h-auto w-full"
          />

          <div className="absolute left-[5.4%] top-[5.2%] max-w-[36%] text-slate-700">
            <div className="text-[28px] font-semibold leading-tight text-slate-800">
              {'\u64cd\u4f5c\u5e2e\u52a9'}
            </div>
            <div className="mt-2 text-[14px] leading-6 text-slate-500">
              {'\u5feb\u901f\u4e86\u89e3\u865a\u62df\u5c55\u5385\u7684\u64cd\u4f5c\u65b9\u5f0f'}
            </div>
          </div>

          {HELP_LINES.map((line, index) => (
            <div
              key={line}
              className="absolute left-[11.9%] right-[5.8%] flex items-center whitespace-nowrap text-[14px] text-slate-600"
              style={{
                top: STEP_ROWS[index].top,
                height: STEP_ROWS[index].height,
                textShadow: '0 1px 0 rgba(255,255,255,0.65)',
              }}
            >
              {line}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button type="primary" size="large" onClick={onClose}>
            {'\u6211\u77e5\u9053\u4e86'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
