import axios from 'axios';
import packageJson from '../../package.json';

const CURRENT_VERSION = packageJson.version;
const GITHUB_RELEASE_API = 'https://api.github.com/repos/Crazyfre/SolarOS_PowerCut_Notifier/releases/latest';
const TRUSTED_RELEASE_PREFIX = 'https://github.com/Crazyfre/SolarOS_PowerCut_Notifier/releases';
const CANONICAL_RELEASE_URL = 'https://github.com/Crazyfre/SolarOS_PowerCut_Notifier/releases/latest';

function sanitizeReleaseUrl(url: unknown): string {
  if (typeof url === 'string' && url.startsWith(`${TRUSTED_RELEASE_PREFIX}/`)) {
    return url;
  }
  return CANONICAL_RELEASE_URL;
}

/** Semver precedence, including prereleases and the workflow's release-v tags. */
export function compareVersions(left: string, right: string): number {
  const parse = (version: string) => /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.replace(/^(?:release-)?v/, ''));
  const a = parse(left), b = parse(right);
  if (!a || !b) return 0;
  for (let i = 1; i <= 3; i++) {
    const delta = Number(a[i]) - Number(b[i]);
    if (delta) return Math.sign(delta);
  }
  if (a[4] === b[4]) return 0;
  if (!a[4]) return 1;
  if (!b[4]) return -1;
  const preA = a[4].split('.'), preB = b[4].split('.');
  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    if (preA[i] === undefined) return -1;
    if (preB[i] === undefined) return 1;
    if (preA[i] === preB[i]) continue;
    const numA = /^\d+$/.test(preA[i]), numB = /^\d+$/.test(preB[i]);
    if (numA && numB) return Math.sign(Number(preA[i]) - Number(preB[i]));
    if (numA !== numB) return numA ? -1 : 1;
    return preA[i] < preB[i] ? -1 : 1;
  }
  return 0;
}

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const response = await axios.get(GITHUB_RELEASE_API, {
      headers: {
        'User-Agent': 'SolarGuard-App',
      },
      timeout: 5000,
    });

    const latestTag = response.data.tag_name; // e.g. "v1.1.0" or "1.1.0"
    if (typeof latestTag !== 'string' || !latestTag) {
      return {
        updateAvailable: false,
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        releaseUrl: CANONICAL_RELEASE_URL,
      };
    }

    const latestVersion = latestTag.replace(/^(?:release-)?v/, '');
    const releaseUrl = sanitizeReleaseUrl(response.data.html_url);

    const updateAvailable = compareVersions(latestVersion, CURRENT_VERSION) > 0;

    return {
      updateAvailable,
      currentVersion: CURRENT_VERSION,
      latestVersion,
      releaseUrl,
    };
  } catch (error) {
    console.error('[UpdateChecker] Failed to check for updates:', error);
    return {
      updateAvailable: false,
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      releaseUrl: '',
    };
  }
}
