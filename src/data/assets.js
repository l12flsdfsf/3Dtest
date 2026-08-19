const FIGMA_ASSET_BASE = '/figma-assets'

const rawExport = (path) =>
  `${FIGMA_ASSET_BASE}/${encodeURI(`\u7518\u8083\u5c55\u5385/${path}`).replaceAll('%2F', '/')}`

export const FIGMA_ASSETS = {
  guideMap: `${FIGMA_ASSET_BASE}/guide-map.png`,
  storyCover: `${FIGMA_ASSET_BASE}/story-cover.png`,
  modelCover: `${FIGMA_ASSET_BASE}/model-cover.png`,
  videoCover: `${FIGMA_ASSET_BASE}/video-cover.png`,
  helpCover: `${FIGMA_ASSET_BASE}/help-cover.png`,
  hallBackground: `${FIGMA_ASSET_BASE}/hall-bg.png`,
}

export const RAW_FIGMA_EXPORTS = {
  background: rawExport('bg.png'),
  topNavigation: rawExport('Top Navigation.png'),
  mapScene: rawExport('01 \u5730\u56fe/1920x1080.png'),
  helpScene: rawExport('02 \u64cd\u4f5c\u5e2e\u52a9/ 1920x1080.png'),
  modelScene: rawExport('03 \u6a21\u578b/ 1920x1080.png'),
  videoScene: rawExport('04 \u89c6\u9891/ 1920x1080.png'),
  detailScene: rawExport('05 \u70ed\u70b9\u8be6\u60c5/ 1920x1080.png'),
  cPanel: rawExport('C.png'),
  cPanel1: rawExport('C-1.png'),
  cPanel2: rawExport('C-2.png'),
  cPanel3: rawExport('C-3.png'),
  volumePanel: '/ui/volume-panel.png',
  volumeRail: '/ui/volume-rail.png',
  volumeFill: '/ui/volume-fill.png',
  volumeThumb: '/ui/volume-thumb.png',
}
