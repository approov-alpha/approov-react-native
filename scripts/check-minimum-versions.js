// Fails when the minimum React Native and Expo versions stated in the README badge row, the README text
// and package.json disagree, so the minimum a developer reads is the minimum the package declares.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const errors = [];

// the minimum from a peer dependency range such as ">=0.82.0", as major.minor
function minimumOf(name) {
  const range = (pkg.peerDependencies || {})[name];
  const match = /^>=(\d+)\.(\d+)\.\d+$/.exec(range || '');
  if (!match) {
    errors.push(`package.json peerDependencies.${name} must be a ">=X.Y.Z" range, found ${JSON.stringify(range)}`);
    return null;
  }
  return { major: match[1], minor: match[2] };
}

const reactNative = minimumOf('react-native');
if (reactNative) {
  const version = `${reactNative.major}.${reactNative.minor}`;
  if (!readme.includes(`React%20Native-${version}%2B`)) {
    errors.push(`README.md badge row has no "React Native ${version}+" badge`);
  }
  if (!readme.includes(`React Native ${version} or later`)) {
    errors.push(`README.md does not say "React Native ${version} or later"`);
  }
}

const expo = minimumOf('expo');
if (expo) {
  if (!readme.includes(`Expo-SDK%20${expo.major}%2B`)) {
    errors.push(`README.md badge row has no "Expo SDK ${expo.major}+" badge`);
  }
  if (!readme.includes(`Expo SDK ${expo.major} or later`)) {
    errors.push(`README.md does not say "Expo SDK ${expo.major} or later"`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`check-minimum-versions: ${error}`);
  }
  process.exit(1);
}
console.log('check-minimum-versions: README.md and package.json agree');
