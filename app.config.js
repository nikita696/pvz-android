const blockedAndroidPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.VIBRATE',
];
const internetPermission = 'android.permission.INTERNET';

module.exports = ({ config }) => {
  const ownerSyncEnabled = process.env.EXPO_PUBLIC_PVZ_SYNC_MODE === 'owner';

  return {
    ...config,
    android: {
      ...config.android,
      permissions: ownerSyncEnabled ? [internetPermission] : [],
      blockedPermissions: ownerSyncEnabled
        ? blockedAndroidPermissions
        : [...blockedAndroidPermissions, internetPermission],
    },
  };
};
