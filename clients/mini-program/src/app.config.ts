export default defineAppConfig({
  pages: [
    // Entry page — login (feat-121). app.ts cold-start restore redirects to
    // /pages/chat/index when a session already exists, so anonymous users see
    // login and returning users land directly in chat.
    'pages/login/index',
    'pages/chat/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'WeChat',
    navigationBarTextStyle: 'black',
  },
});