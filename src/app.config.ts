export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/pattern/detail',
    'pages/palette/index',
    'pages/profile/index',
  ],
  subPackages: [
    {
      root: 'packagePattern',
      pages: [
        'pages/view/index',
        'pages/create/index',
        'pages/editor/index',
      ],
    },
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#F7F4EF',
    navigationBarTitleText: 'BeadHub',
    navigationBarTextStyle: 'black'
  }
})
