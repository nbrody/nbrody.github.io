// Public Firebase web-app configuration shared with docs/Talks/Boise/js/remote.js.
// Graphics sessions use a distinct prefix and never touch presentation sessions.
export const firebaseConfig = {
  apiKey: 'AIzaSyCzFggXRlNNaBpdcZAxwpGipZkShlS-D3c',
  authDomain: 'mathtalks-84dad.firebaseapp.com',
  databaseURL: 'https://mathtalks-84dad-default-rtdb.firebaseio.com',
  projectId: 'mathtalks-84dad',
  appId: '1:1054624515671:web:443553a24a59486f91c512',
};
let loading;
function script(src) {
  return new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = src;
    node.onload = resolve;
    node.onerror = () => { node.remove(); reject(new Error('Could not load phone pairing. Check your internet connection and retry.')); };
    document.head.append(node);
  });
}
export function loadFirebase() {
  if (!loading) loading = (async () => {
    if (!window.firebase) await script('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
    if (!window.firebase.database) await script('https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js');
    const firebase = window.firebase;
    const app = firebase.apps.find(app => app.name === 'graphics-studio') || firebase.initializeApp(firebaseConfig, 'graphics-studio');
    return app.database();
  })().catch(error => { loading = null; throw error; });
  return loading;
}
