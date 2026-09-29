const path = require('path');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const options = {};
  if (process.env.FIREBASE_PROJECT_ID) options.projectId = process.env.FIREBASE_PROJECT_ID;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    options.credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    options.credential = admin.credential.cert(
      require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH))
    );
  }
  admin.initializeApp(options);
}

module.exports = admin;
