import axios from 'axios';
import packageJson from '../../package.json';

const CURRENT_VERSION = packageJson.version;
const GITHUB_RELEASE_API = 'https://api.github.com/repos/Crazyfre/SolarOS_PowerCut_Notifier/releases/latest';

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
    if (!latestTag) {
      return {
        updateAvailable: false,
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        releaseUrl: '',
      };
    }

    const latestVersion = latestTag.replace(/^v/, '');
    const releaseUrl = response.data.html_url || 'https://github.com/Crazyfre/SolarOS_PowerCut_Notifier/releases/latest';

    // Simple semver comparison helper (x.y.z)
    const compareVersions = (v1: string, v2: string): number => {
      const parts1 = v1.split('.').map(Number);
      const parts2 = v2.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
      }
      return 0;
    };

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
