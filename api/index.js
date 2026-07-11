// Neofetch Profile API - Vercel Serverless Function
// Generates SVG stats card for GitHub users

import { Jimp } from 'jimp';

const THEMES = {
  'github-dark': {
    bg: '#161b22',
    key: '#ffa657',
    val: '#a5d6ff',
    sep: '#616e7f',
    add: '#3fb950',
    del: '#f85149',
    ascii: '#c9d1d9',
    text: '#c9d1d9'
  },
  'github-light': {
    bg: '#f6f8fa',
    key: '#953800',
    val: '#0a3069',
    sep: '#c2cfde',
    add: '#1a7f37',
    del: '#cf222e',
    ascii: '#24292f',
    text: '#24292f'
  }
};

// ASCII character set for image conversion (light to dark)
const ASCII_CHARS = ' .`"^-+*o()[]{}?#%@M';

// Convert RGB to hex color
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Convert avatar image to ASCII art (matching browser algorithm)
async function avatarToAscii(avatarUrl, maxHeight = 25, maxWidth = 38, respectTransparency = false, colored = false) {
  try {
    const image = await Jimp.read(avatarUrl);

    // For PNGs with transparency, crop to bounding box of non-transparent pixels first
    if (respectTransparency) {
      let minX = image.width, minY = image.height, maxX = 0, maxY = 0;
      let hasOpaquePixels = false;

      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const color = image.getPixelColor(x, y);
          const a = color & 0xFF;
          if (a >= 128) {
            hasOpaquePixels = true;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      // Crop to bounding box if we found opaque pixels
      if (hasOpaquePixels && (minX > 0 || minY > 0 || maxX < image.width - 1 || maxY < image.height - 1)) {
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        image.crop({ x: minX, y: minY, w: cropW, h: cropH });
      }
    }

    // Characters are ~0.55 width/height ratio (Consolas/Monaco at 16px)
    const charAspect = 0.55;
    const imgAspect = image.width / image.height;

    // Cover mode: fill the entire area, crop if needed
    // Calculate dimensions for both fit-to-height and fit-to-width
    const widthIfFitToHeight = Math.round(maxHeight * imgAspect / charAspect);
    const heightIfFitToWidth = Math.round(maxWidth * charAspect / imgAspect);

    let scaleWidth, scaleHeight;

    // Choose the option that covers the area (the larger scale)
    if (widthIfFitToHeight >= maxWidth) {
      // Fit to height covers width, so scale to height
      scaleWidth = widthIfFitToHeight;
      scaleHeight = maxHeight;
    } else {
      // Fit to width covers height, so scale to width
      scaleWidth = maxWidth;
      scaleHeight = heightIfFitToWidth;
    }

    // Resize to cover the area
    image.resize({ w: scaleWidth, h: scaleHeight });

    // Center crop to exact target dimensions
    const cropX = Math.max(0, Math.floor((scaleWidth - maxWidth) / 2));
    const cropY = Math.max(0, Math.floor((scaleHeight - maxHeight) / 2));
    const finalWidth = Math.min(scaleWidth, maxWidth);
    const finalHeight = Math.min(scaleHeight, maxHeight);

    if (cropX > 0 || cropY > 0) {
      image.crop({ x: cropX, y: cropY, w: finalWidth, h: finalHeight });
    }

    // Use actual image dimensions after operations
    const width = image.width;
    const height = image.height;

    // Calculate average luminance to determine if we should invert (only for opaque pixels)
    let lumaTotal = 0;
    let pixelCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = image.getPixelColor(x, y);
        const a = color & 0xFF;
        // Skip transparent pixels for luminance calculation
        if (respectTransparency && a < 128) continue;
        const r = (color >> 24) & 0xFF;
        const g = (color >> 16) & 0xFF;
        const b = (color >> 8) & 0xFF;
        lumaTotal += 0.299 * r + 0.587 * g + 0.114 * b;
        pixelCount++;
      }
    }
    const avgLuma = pixelCount > 0 ? lumaTotal / pixelCount : 128;
    const shouldInvert = avgLuma < 128; // Invert if image is mostly dark

    const lines = [];
    const contrast = 1.2;

    // Calculate horizontal padding to center the image (only for transparent images)
    const padLeft = respectTransparency ? Math.floor((maxWidth - width) / 2) : 0;

    for (let y = 0; y < height; y++) {
      const lineData = colored ? [] : '';
      let line = colored ? lineData : '';

      // Add left padding (only for transparent images)
      if (padLeft > 0) {
        if (colored) {
          for (let i = 0; i < padLeft; i++) {
            lineData.push({ char: ' ', color: null });
          }
        } else {
          line = ' '.repeat(padLeft);
        }
      }

      for (let x = 0; x < width; x++) {
        const pixelColor = image.getPixelColor(x, y);
        const r = (pixelColor >> 24) & 0xFF;
        const g = (pixelColor >> 16) & 0xFF;
        const b = (pixelColor >> 8) & 0xFF;
        const a = pixelColor & 0xFF;

        // If transparent and we're respecting transparency, use space
        if (respectTransparency && a < 128) {
          if (colored) {
            lineData.push({ char: ' ', color: null });
          } else {
            line += ' ';
          }
          continue;
        }

        // Calculate luminance
        let luma = 0.299 * r + 0.587 * g + 0.114 * b;

        // Apply contrast for character selection
        let adjustedLuma = (luma - 128) * contrast + 128;
        adjustedLuma = Math.max(0, Math.min(255, adjustedLuma));

        // Invert if needed (so we get dark chars on light bg or vice versa)
        if (shouldInvert) {
          adjustedLuma = 255 - adjustedLuma;
        }

        // Map to ASCII character
        const charIndex = Math.floor(adjustedLuma / 255 * (ASCII_CHARS.length - 1));
        const char = ASCII_CHARS[charIndex];

        if (colored) {
          lineData.push({ char, color: rgbToHex(r, g, b) });
        } else {
          line += char;
        }
      }

      lines.push(colored ? lineData : line);
    }

    // Add vertical padding to center the image (only for transparent images)
    const padTop = respectTransparency ? Math.floor((maxHeight - height) / 2) : 0;

    if (padTop > 0) {
      if (colored) {
        const emptyLine = Array(maxWidth).fill({ char: ' ', color: null });
        const paddedLines = [];
        for (let i = 0; i < padTop; i++) {
          paddedLines.push([...emptyLine]);
        }
        paddedLines.push(...lines);
        return { colored: true, lines: paddedLines };
      } else {
        const emptyLine = ' '.repeat(maxWidth);
        const paddedLines = [];
        for (let i = 0; i < padTop; i++) {
          paddedLines.push(emptyLine);
        }
        paddedLines.push(...lines);
        return paddedLines;
      }
    }

    // No padding needed
    return colored ? { colored: true, lines } : lines;
  } catch (error) {
    console.error('Failed to convert avatar:', error);
    return null;
  }
}

// Default ASCII art (fallback)
const DEFAULT_ASCII = [
  "           g@M%@%%@N%Nw,,                   ",
  "        ,M*|`||*%gNM=]mM%g||%N,             ",
  "       p!``  '! |''` '''|||jhlj%w           ",
  "     ,@L `    ,,        ''!`|j%M]%M         ",
  "    ]j'` .,wp@pw,    `.     ''''|%Wg       ",
  "  /{||]@@@@@@@@@pp.             |||||      ",
  " '` ']@@@@@@@@@@@@@@p     , ,'''` `        ",
  "  , :]%%@@@@@%%%%%%k%h '*||mkr     *       ",
  "  '  j%M`      |jkk'   ~nrn=|i    ;`       ",
  "   !  jrr*^`             `\"!  L'':!   ",
  "    j  lp;,.  ,/ @@    ,;\\\\nmy \"  ,~   ",
  "   i r @@@@mmHM @@@@ `^****M*,p ;,         ",
  "   | ]@@@@HHH]g@M%%%%%H,jmgpmb%  j         ",
  "    ;;%%%%%k%@[,.n|;.;j%%k|%k%%',[         ",
  "     H|%%k%%%j%k||,;;j;!!'|%ij}]@          ",
  "     \"djjmkL,\"\"]][,,,,wwxw;|#kjk` ",
  "       %;%km%%%%M%M|%%jkkii|||[            ",
  "        kjj%%kkkl|!||||||j|||\"        ",
  "         |jm%H@@@b%%kkmk%i|!,[             ",
  "         @p|j%%%%jkk|||j*'`;j[             ",
  "        ]@@@g|'''`'''  ` ,;j%k             ",
  "        @@@@@mgmp;,,,,:;jj%%k%             ",
  "       @@@@@@@@%%kgki!|jjjj%k%@ .          ",
  ". ^['' %@@@@HH%b%k{illljkjj%%%% ; `,.      ",
  "=[' ` . %HH%%%%%H@gkilljjj%kk%\".   `'i"
];

// Constants for alignment (same as client-side)
const ROW_CHAR_LENGTH = 60;
const PIPE_POSITION = 36;

// Helper to escape XML special characters
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Format number with commas
function formatNumber(num) {
  return num.toLocaleString('en-US');
}

// Calculate uptime from date
function calculateUptime(birthday) {
  const bday = new Date(birthday);
  if (isNaN(bday.getTime())) return '';

  const today = new Date();
  let years = today.getFullYear() - bday.getFullYear();
  let months = today.getMonth() - bday.getMonth();
  let days = today.getDate() - bday.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const formatPlural = (num, word) => `${num} ${word}${num !== 1 ? 's' : ''}`;
  return `${formatPlural(years, 'year')}, ${formatPlural(months, 'month')}, ${formatPlural(days, 'day')}`;
}

// Fit detail row - calculates dots for key:value alignment
function fitDetailRow(key, value) {
  const prefix = '. ';
  const colon = ':';
  let displayValue = String(value || '');

  // Calculate available characters for dots
  let availableForDots = ROW_CHAR_LENGTH - prefix.length - key.length - colon.length - displayValue.length;

  // Truncate value if not enough space for minimum dots " . " (3 chars)
  while (displayValue.length > 3 && availableForDots < 3) {
    const contentLen = displayValue.length - 3;
    const startLen = Math.max(1, Math.ceil(contentLen / 2) - 1);
    const endLen = Math.max(1, Math.floor(contentLen / 2) - 1);
    displayValue = displayValue.slice(0, startLen) + '...' + displayValue.slice(-endLen);
    availableForDots = ROW_CHAR_LENGTH - prefix.length - key.length - colon.length - displayValue.length;
  }

  // Calculate dot count: availableForDots includes " " + dots + " "
  const dotCount = Math.max(1, availableForDots - 2);

  return {
    key: key,
    dots: ' ' + '.'.repeat(dotCount) + ' ',
    value: displayValue
  };
}

// Fit section separator with dashes
function fitSectionSeparator(title) {
  const referenceLen = ROW_CHAR_LENGTH;
  const start = ' -';
  const end = '-—-'; // -—-

  // Calculate how many em-dashes fit
  let dashCount = referenceLen - title.length - start.length - end.length;
  dashCount = Math.max(0, dashCount);

  return start + '—'.repeat(dashCount) + end;
}

// Generic function to fit a split row with "|" separator at PIPE_POSITION
function fitSplitRow(leftKey, leftVal, rightKey, rightVal) {
  const leftKeyStr = String(leftKey);
  const leftValStr = String(leftVal);
  const rightKeyStr = String(rightKey);
  const rightValStr = String(rightVal);

  // Before "|": ". " + leftKey + ":" + dots1 + leftVal + " " = 3 + leftKey.length + dots1 + leftVal.length + 1
  // So: 4 + leftKey.length + dots1 + leftVal.length = PIPE_POSITION
  const leftFixed = 4 + leftKeyStr.length + leftValStr.length;
  const dots1Len = Math.max(3, PIPE_POSITION - leftFixed);

  // After "|": "| " + rightKey + ":" + dots2 + rightVal = 2 + rightKey.length + 1 + dots2 + rightVal.length
  // Available space after "|" = ROW_CHAR_LENGTH - PIPE_POSITION = 24
  const rightFixed = 3 + rightKeyStr.length + rightValStr.length;
  const dots2Len = Math.max(3, (ROW_CHAR_LENGTH - PIPE_POSITION) - rightFixed);

  const dots1 = ' ' + '.'.repeat(Math.max(1, dots1Len - 2)) + ' ';
  const dots2 = ' ' + '.'.repeat(Math.max(1, dots2Len - 2)) + ' ';

  return { dots1, dots2, leftKey: leftKeyStr, leftVal: leftValStr, rightKey: rightKeyStr, rightVal: rightValStr };
}

// Fit Lines of Code row
function fitLocRow(loc, locAdd, locDel) {
  const fixedLen = 16 + 3 + 2 + 1 + 2 + 2; // = 26
  const locStr = String(loc);
  const addStr = String(locAdd);
  const delStr = String(locDel);

  const availableForVariable = ROW_CHAR_LENGTH - fixedLen;
  const spaceForDots = availableForVariable - locStr.length - addStr.length - delStr.length;

  const dots2Len = Math.max(1, Math.min(2, spaceForDots - 3));
  const dots1Len = Math.max(3, spaceForDots - dots2Len);

  const dots1 = ' ' + '.'.repeat(Math.max(1, dots1Len - 2)) + ' ';
  const dots2 = ' '.repeat(dots2Len);

  return { dots1, dots2 };
}

// Fetch GitHub data
async function fetchGitHubData(username, token) {
  const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'neofetch-profile' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Fetch user data
  const userRes = await fetch(`https://api.github.com/users/${username}`, { headers });
  if (!userRes.ok) {
    if (userRes.status === 404) throw new Error('User not found');
    if (userRes.status === 403) throw new Error('GitHub API rate limit exceeded. Try again later or add GITHUB_TOKEN.');
    const errorData = await userRes.json().catch(() => ({}));
    throw new Error(`GitHub API error: ${userRes.status} - ${errorData.message || 'Unknown error'}`);
  }
  const userData = await userRes.json();

  // Get repo count (including private if authenticated)
  let totalRepos = userData.public_repos;
  if (token) {
    const authUserRes = await fetch('https://api.github.com/user', { headers });
    if (authUserRes.ok) {
      const authUserData = await authUserRes.json();
      if (authUserData.login.toLowerCase() === username.toLowerCase()) {
        totalRepos = authUserData.public_repos + (authUserData.total_private_repos || 0);
      }
    }
  }

  // Fetch repos for star count and language stats
  let starsCount = 0;
  let totalForks = 0;
  let page = 1;
  let hasMore = true;
  const languageCounts = {};

  const reposEndpoint = token
    ? `https://api.github.com/user/repos?per_page=100&affiliation=owner&page=`
    : `https://api.github.com/users/${username}/repos?per_page=100&page=`;

  while (hasMore && page <= 10) {
    const reposRes = await fetch(`${reposEndpoint}${page}`, { headers });
    if (reposRes.ok) {
      const reposData = await reposRes.json();
      if (reposData.length === 0) {
        hasMore = false;
      } else {
        reposData.forEach(repo => {
          starsCount += repo.stargazers_count;
          totalForks += repo.forks_count;
          // Track languages
          if (repo.language) {
            languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
          }
        });
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  // Get top 4 languages
  const topLanguages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([lang]) => lang)
    .join(', ') || 'Various';

  // Fetch issues and PRs count via search API
  let issuesCount = 0;
  let prsCount = 0;

  try {
    const [issuesRes, prsRes] = await Promise.all([
      fetch(`https://api.github.com/search/issues?q=author:${username}+type:issue`, { headers }),
      fetch(`https://api.github.com/search/issues?q=author:${username}+type:pr`, { headers })
    ]);

    if (issuesRes.ok) {
      const issuesData = await issuesRes.json();
      issuesCount = issuesData.total_count || 0;
    }

    if (prsRes.ok) {
      const prsData = await prsRes.json();
      prsCount = prsData.total_count || 0;
    }
  } catch (error) {
    console.error('Failed to fetch issues/PRs:', error);
  }

  // Estimate other stats
  const contribCount = Math.round(userData.public_repos * 0.3) + Math.round(totalForks * 0.1);
  const avgCommitsPerRepo = 50;
  const estimatedCommits = totalRepos * avgCommitsPerRepo;
  const avgLocPerRepo = 2000;
  const estimatedLoc = totalRepos * avgLocPerRepo + starsCount * 100;
  const additions = Math.round(estimatedLoc * 1.2);
  const deletions = Math.round(estimatedLoc * 0.2);

  return {
    username: userData.login,
    name: userData.name || userData.login,
    company: userData.company ? userData.company.replace(/^@/, '') : '',
    bio: userData.bio ? userData.bio.substring(0, 40) : '',
    email: userData.email || '',
    location: userData.location || '',
    blog: userData.blog || '',
    twitter: userData.twitter_username || '',
    avatarUrl: userData.avatar_url || '',
    createdAt: userData.created_at?.substring(0, 10) || '',
    repos: totalRepos,
    followers: userData.followers,
    following: userData.following,
    stars: starsCount,
    forks: totalForks,
    gists: userData.public_gists || 0,
    issues: issuesCount,
    prs: prsCount,
    contrib: contribCount,
    commits: formatNumber(estimatedCommits),
    loc: formatNumber(estimatedLoc),
    locAdd: formatNumber(additions),
    locDel: formatNumber(deletions),
    topLanguages: topLanguages
  };
}

// Generate SVG with custom config
function generateSvgWithConfig(data, config, asciiArt, isCustomAscii = false, theme = 'github-dark') {
  const colors = THEMES[theme] || THEMES['github-dark'];

  // Build ASCII art tspans - always left-aligned at x=15
  const asciiX = 15;
  const textAnchor = '';

  let asciiLines;
  const isColored = asciiArt && asciiArt.colored;

  if (isColored) {
    // Colored ASCII art - each character has its own color
    asciiLines = asciiArt.lines.map((lineData, i) => {
      const y = 30 + i * 20;
      let lineContent = '';
      let currentColor = null;
      let buffer = '';

      for (const { char, color } of lineData) {
        if (color === currentColor) {
          buffer += escapeXml(char);
        } else {
          if (buffer) {
            if (currentColor) {
              lineContent += `<tspan fill="${currentColor}">${buffer}</tspan>`;
            } else {
              lineContent += buffer;
            }
          }
          buffer = escapeXml(char);
          currentColor = color;
        }
      }
      // Flush remaining buffer
      if (buffer) {
        if (currentColor) {
          lineContent += `<tspan fill="${currentColor}">${buffer}</tspan>`;
        } else {
          lineContent += buffer;
        }
      }

      return `<tspan x="${asciiX}" y="${y}">${lineContent}</tspan>`;
    }).join('\n');
  } else {
    // Monochrome ASCII art
    asciiLines = asciiArt.map((line, i) => {
      const y = 30 + i * 20;
      return `<tspan x="${asciiX}" y="${y}">${escapeXml(line)}</tspan>`;
    }).join('\n');
  }

  // Build detail rows from config
  let y = 30;
  const lineHeight = 20;
  let detailLines = [];

  // Process each section from config
  for (const section of config.sections) {
    // Section title (if provided and not null)
    if (section.title) {
      const sectionSeparator = fitSectionSeparator(section.title);
      detailLines.push(`<tspan x="390" y="${y}">${escapeXml(section.title)}</tspan><tspan>${escapeXml(sectionSeparator)}</tspan>`);
      y += lineHeight;
    }

    // Section fields
    for (const field of section.fields) {
      const row = fitDetailRow(field.key, field.value);
      detailLines.push(`<tspan x="390" y="${y}" class="cc">. </tspan><tspan class="key">${escapeXml(row.key)}</tspan>:<tspan class="cc">${escapeXml(row.dots)}</tspan><tspan class="value">${escapeXml(row.value)}</tspan>`);
      y += lineHeight;
    }

    // Empty line after section
    detailLines.push(`<tspan x="390" y="${y}" class="cc">. </tspan>`);
    y += lineHeight;
  }

  // GitHub Stats section (configurable via config.stats)
  if (config.stats && config.stats.enabled !== false) {
    const statsTitle = config.stats.title || '- GitHub Stats';
    const statsSeparator = fitSectionSeparator(statsTitle);

    detailLines.push(`<tspan x="390" y="${y}">${escapeXml(statsTitle)}</tspan><tspan>${escapeXml(statsSeparator)}</tspan>`);
    y += lineHeight;

    const rows = config.stats.rows || ['repos-stars', 'commits-followers', 'loc'];

    for (const row of rows) {
      if (row === 'loc') {
        // Special case: includes ++/-- format
        const { dots1: locDots, dots2: locDelDots } = fitLocRow(data.loc, data.locAdd, data.locDel);
        detailLines.push(`<tspan x="390" y="${y}" class="cc">. </tspan><tspan class="key">Lines of Code</tspan>:<tspan class="cc">${escapeXml(locDots)}</tspan><tspan class="value">${data.loc}</tspan> ( <tspan class="addColor">${data.locAdd}</tspan><tspan class="addColor">++</tspan>,${escapeXml(locDelDots)}<tspan class="delColor">${data.locDel}</tspan><tspan class="delColor">--</tspan> )`);
      } else if (row.left && row.right) {
        // Split row with left/right key-value pairs
        const r = fitSplitRow(row.left.key, row.left.value, row.right.key, row.right.value);
        detailLines.push(`<tspan x="390" y="${y}" class="cc">. </tspan><tspan class="key">${escapeXml(r.leftKey)}</tspan>:<tspan class="cc">${escapeXml(r.dots1)}</tspan><tspan class="value">${escapeXml(r.leftVal)}</tspan> | <tspan class="key">${escapeXml(r.rightKey)}</tspan>:<tspan class="cc">${escapeXml(r.dots2)}</tspan><tspan class="value">${escapeXml(r.rightVal)}</tspan>`);
      }

      y += lineHeight;
    }
  }

  const svg = `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns="http://www.w3.org/2000/svg" font-family="Consolas,Monaco,monospace" width="985px" height="530px" font-size="16px">
<style>
@font-face {
  src: local('Consolas'), local('Monaco'), local('monospace');
  font-family: 'CardFont';
  font-display: swap;
}
.key { fill: ${colors.key}; }
.value { fill: ${colors.val}; }
.addColor { fill: ${colors.add}; }
.delColor { fill: ${colors.del}; }
.cc { fill: ${colors.sep}; }
text, tspan { white-space: pre; }
</style>
<rect width="985px" height="530px" fill="${colors.bg}" rx="15"/>
<text x="${asciiX}" y="30" fill="${colors.ascii}"${textAnchor}>
${asciiLines}
</text>
<text x="390" y="30" fill="${colors.text}">
${detailLines.join('\n')}
</text>
</svg>`;

  return svg;
}

// Generate SVG (legacy - kept for reference)
function generateSvg(data, asciiArt, isCustomAscii = false, theme = 'github-dark') {
  const colors = THEMES[theme] || THEMES['github-dark'];

  // Build ASCII art tspans
  // Custom ASCII (from avatar) is centered at x=195, default ASCII at x=15
  const asciiX = isCustomAscii ? 195 : 15;
  const textAnchor = isCustomAscii ? ' text-anchor="middle"' : '';

  const asciiLines = asciiArt.map((line, i) => {
    const y = 30 + i * 20;
    return `<tspan x="${asciiX}" y="${y}">${escapeXml(line)}</tspan>`;
  }).join('\n');

  // Calculate uptime
  const uptime = data.createdAt ? calculateUptime(data.createdAt) : '0 years';

  // Title
  const title = `${data.username}@github`;
  const titleSeparator = fitSectionSeparator(title);

  // System Info rows
  const osRow = fitDetailRow('OS', 'GitHub Profile');
  const uptimeRow = fitDetailRow('Uptime', uptime);
  const hostRow = fitDetailRow('Host', data.name || data.username);
  const kernelRow = fitDetailRow('Kernel', data.company || data.bio || 'Developer');
  const ideRow = fitDetailRow('IDE', `github.com/${data.username}`);

  // Languages rows (we can derive some from repo languages later, for now use defaults)
  const langProgRow = fitDetailRow('Languages.Programming', data.topLanguages || 'Various');
  const langCompRow = fitDetailRow('Languages.Computer', 'Markdown, JSON, YAML');
  const langRealRow = fitDetailRow('Languages.Real', data.location || 'Earth');

  // Hobbies rows
  const hobSoftRow = fitDetailRow('Hobbies.Software', 'Open Source');
  const hobHardRow = fitDetailRow('Hobbies.Hardware', 'Coding');

  // Contact section
  const contactSeparator = fitSectionSeparator('- Contact');
  const email1Row = fitDetailRow('Email.Personal', data.email || 'Not public');
  const email2Row = fitDetailRow('Email.Work', data.email || 'Not public');
  const linkedinRow = fitDetailRow('LinkedIn', data.username);
  const discordRow = fitDetailRow('Discord', data.username);

  // Stats section
  const statsSeparator = fitSectionSeparator('- GitHub Stats');
  const { dots1: repoDots, dots2: starDots } = fitReposStarsRow(data.repos, data.contrib, data.stars);
  const { dots1: commitDots, dots2: followerDots } = fitCommitsFollowersRow(data.commits, data.followers);
  const { dots1: locDots, dots2: locDelDots } = fitLocRow(data.loc, data.locAdd, data.locDel);

  const svg = `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns="http://www.w3.org/2000/svg" font-family="Consolas,Monaco,monospace" width="985px" height="530px" font-size="16px">
<style>
@font-face {
  src: local('Consolas'), local('Monaco'), local('monospace');
  font-family: 'CardFont';
  font-display: swap;
}
.key { fill: ${colors.key}; }
.value { fill: ${colors.val}; }
.addColor { fill: ${colors.add}; }
.delColor { fill: ${colors.del}; }
.cc { fill: ${colors.sep}; }
text, tspan { white-space: pre; }
</style>
<rect width="985px" height="530px" fill="${colors.bg}" rx="15"/>
<text x="${asciiX}" y="30" fill="${colors.ascii}"${textAnchor}>
${asciiLines}
</text>
<text x="390" y="30" fill="${colors.text}">
<tspan x="390" y="30">${escapeXml(title)}</tspan><tspan>${escapeXml(titleSeparator)}</tspan>
<tspan x="390" y="50" class="cc">. </tspan><tspan class="key">${escapeXml(osRow.key)}</tspan>:<tspan class="cc">${escapeXml(osRow.dots)}</tspan><tspan class="value">${escapeXml(osRow.value)}</tspan>
<tspan x="390" y="70" class="cc">. </tspan><tspan class="key">${escapeXml(uptimeRow.key)}</tspan>:<tspan class="cc">${escapeXml(uptimeRow.dots)}</tspan><tspan class="value">${escapeXml(uptimeRow.value)}</tspan>
<tspan x="390" y="90" class="cc">. </tspan><tspan class="key">${escapeXml(hostRow.key)}</tspan>:<tspan class="cc">${escapeXml(hostRow.dots)}</tspan><tspan class="value">${escapeXml(hostRow.value)}</tspan>
<tspan x="390" y="110" class="cc">. </tspan><tspan class="key">${escapeXml(kernelRow.key)}</tspan>:<tspan class="cc">${escapeXml(kernelRow.dots)}</tspan><tspan class="value">${escapeXml(kernelRow.value)}</tspan>
<tspan x="390" y="130" class="cc">. </tspan><tspan class="key">${escapeXml(ideRow.key)}</tspan>:<tspan class="cc">${escapeXml(ideRow.dots)}</tspan><tspan class="value">${escapeXml(ideRow.value)}</tspan>
<tspan x="390" y="150" class="cc">. </tspan>
<tspan x="390" y="170" class="cc">. </tspan><tspan class="key">${escapeXml(langProgRow.key)}</tspan>:<tspan class="cc">${escapeXml(langProgRow.dots)}</tspan><tspan class="value">${escapeXml(langProgRow.value)}</tspan>
<tspan x="390" y="190" class="cc">. </tspan><tspan class="key">${escapeXml(langCompRow.key)}</tspan>:<tspan class="cc">${escapeXml(langCompRow.dots)}</tspan><tspan class="value">${escapeXml(langCompRow.value)}</tspan>
<tspan x="390" y="210" class="cc">. </tspan><tspan class="key">${escapeXml(langRealRow.key)}</tspan>:<tspan class="cc">${escapeXml(langRealRow.dots)}</tspan><tspan class="value">${escapeXml(langRealRow.value)}</tspan>
<tspan x="390" y="230" class="cc">. </tspan>
<tspan x="390" y="250" class="cc">. </tspan><tspan class="key">${escapeXml(hobSoftRow.key)}</tspan>:<tspan class="cc">${escapeXml(hobSoftRow.dots)}</tspan><tspan class="value">${escapeXml(hobSoftRow.value)}</tspan>
<tspan x="390" y="270" class="cc">. </tspan><tspan class="key">${escapeXml(hobHardRow.key)}</tspan>:<tspan class="cc">${escapeXml(hobHardRow.dots)}</tspan><tspan class="value">${escapeXml(hobHardRow.value)}</tspan>
<tspan x="390" y="310">- Contact</tspan><tspan>${escapeXml(contactSeparator)}</tspan>
<tspan x="390" y="330" class="cc">. </tspan><tspan class="key">${escapeXml(email1Row.key)}</tspan>:<tspan class="cc">${escapeXml(email1Row.dots)}</tspan><tspan class="value">${escapeXml(email1Row.value)}</tspan>
<tspan x="390" y="350" class="cc">. </tspan><tspan class="key">${escapeXml(email2Row.key)}</tspan>:<tspan class="cc">${escapeXml(email2Row.dots)}</tspan><tspan class="value">${escapeXml(email2Row.value)}</tspan>
<tspan x="390" y="370" class="cc">. </tspan><tspan class="key">${escapeXml(linkedinRow.key)}</tspan>:<tspan class="cc">${escapeXml(linkedinRow.dots)}</tspan><tspan class="value">${escapeXml(linkedinRow.value)}</tspan>
<tspan x="390" y="390" class="cc">. </tspan><tspan class="key">${escapeXml(discordRow.key)}</tspan>:<tspan class="cc">${escapeXml(discordRow.dots)}</tspan><tspan class="value">${escapeXml(discordRow.value)}</tspan>
<tspan x="390" y="450">- GitHub Stats</tspan><tspan>${escapeXml(statsSeparator)}</tspan>
<tspan x="390" y="470" class="cc">. </tspan><tspan class="key">Repos</tspan>:<tspan class="cc">${escapeXml(repoDots)}</tspan><tspan class="value">${data.repos}</tspan> {<tspan class="key">Contributed</tspan>: <tspan class="value">${data.contrib}</tspan>} | <tspan class="key">Stars</tspan>:<tspan class="cc">${escapeXml(starDots)}</tspan><tspan class="value">${data.stars}</tspan>
<tspan x="390" y="490" class="cc">. </tspan><tspan class="key">Commmits</tspan>:<tspan class="cc">${escapeXml(commitDots)}</tspan><tspan class="value">${data.commits}</tspan> | <tspan class="key">Followers</tspan>:<tspan class="cc">${escapeXml(followerDots)}</tspan><tspan class="value">${data.followers}</tspan>
<tspan x="390" y="510" class="cc">. </tspan><tspan class="key">Lines of Code</tspan>:<tspan class="cc">${escapeXml(locDots)}</tspan><tspan class="value">${data.loc}</tspan> ( <tspan class="addColor">${data.locAdd}</tspan><tspan class="addColor">++</tspan>,${escapeXml(locDelDots)}<tspan class="delColor">${data.locDel}</tspan><tspan class="delColor">--</tspan> )
</text>
</svg>`;

  return svg;
}

// Fetch user config from URL
async function fetchConfig(configUrl) {
  try {
    const res = await fetch(configUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('Failed to fetch config:', error);
    return null;
  }
}

// Capitalize first letter of a string
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Replace template variables in a string with actual data
function replaceTemplateVars(str, data) {
  if (!str || typeof str !== 'string') return str;

  return str
    .replace(/\{\{username\}\}/g, data.username || '')
    .replace(/\{\{name\}\}/g, data.name || '')
    .replace(/\{\{company\}\}/g, capitalize(data.company) || '')
    .replace(/\{\{location\}\}/g, data.location || '')
    .replace(/\{\{bio\}\}/g, data.bio || '')
    .replace(/\{\{uptime\}\}/g, data.uptime || '')
    .replace(/\{\{languages\}\}/g, data.topLanguages || '')
    .replace(/\{\{repos\}\}/g, String(data.repos || 0))
    .replace(/\{\{stars\}\}/g, String(data.stars || 0))
    .replace(/\{\{forks\}\}/g, String(data.forks || 0))
    .replace(/\{\{gists\}\}/g, String(data.gists || 0))
    .replace(/\{\{issues\}\}/g, String(data.issues || 0))
    .replace(/\{\{prs\}\}/g, String(data.prs || 0))
    .replace(/\{\{commits\}\}/g, data.commits || '')
    .replace(/\{\{followers\}\}/g, String(data.followers || 0))
    .replace(/\{\{following\}\}/g, String(data.following || 0))
    .replace(/\{\{email\}\}/g, data.email || '')
    .replace(/\{\{blog\}\}/g, data.blog || '')
    .replace(/\{\{twitter\}\}/g, data.twitter || '')
    .replace(/\{\{created\}\}/g, data.createdAt || '');
}

// Process config and replace all template variables
function processConfig(config, data) {
  const processed = { sections: [] };

  for (const section of config.sections) {
    const processedSection = {
      title: section.title ? replaceTemplateVars(section.title, data) : null,
      fields: section.fields.map(field => ({
        key: replaceTemplateVars(field.key, data),
        value: replaceTemplateVars(field.value, data)
      }))
    };
    processed.sections.push(processedSection);
  }

  // Process stats section if present
  const defaultRows = [
    { left: { key: 'Repos', value: '{{repos}}' }, right: { key: 'Stars', value: '{{stars}}' } },
    { left: { key: 'Commits', value: '{{commits}}' }, right: { key: 'Followers', value: '{{followers}}' } },
    'loc'
  ];

  const statsRows = config.stats?.rows || defaultRows;

  processed.stats = {
    enabled: config.stats?.enabled !== false,
    title: config.stats?.title ? replaceTemplateVars(config.stats.title, data) : '- GitHub Stats',
    rows: statsRows.map(row => {
      if (row === 'loc') return row;
      if (row.left && row.right) {
        return {
          left: {
            key: replaceTemplateVars(row.left.key, data),
            value: replaceTemplateVars(row.left.value, data)
          },
          right: {
            key: replaceTemplateVars(row.right.key, data),
            value: replaceTemplateVars(row.right.value, data)
          }
        };
      }
      return row;
    })
  };

  // Process image URL if provided
  if (config.image) {
    processed.image = replaceTemplateVars(config.image, data);
  }

  // Process coloredImage option (works for custom image or default GitHub avatar)
  processed.coloredImage = config.coloredImage === true;

  return processed;
}

// Default config when no custom config is provided - minimal, just title + stats
function getDefaultConfig(data) {
  return {
    sections: [
      {
        title: `${data.username}@github`,
        fields: []
      }
    ]
  };
}

// Vercel serverless handler
export default async function handler(req, res) {
  const { username, theme = 'github-dark', config: configUrl } = req.query;

  if (!username) {
    res.status(400).json({ error: 'Missing username parameter. Usage: /api?username=YOUR_GITHUB_USERNAME' });
    return;
  }

  try {
    // Use token from environment variable if available
    const token = process.env.GITHUB_TOKEN || '';

    const data = await fetchGitHubData(username, token);

    // Calculate uptime and add to data
    data.uptime = data.createdAt ? calculateUptime(data.createdAt) : '0 years';

    // Fetch custom config or use default
    let config = null;
    if (configUrl) {
      config = await fetchConfig(configUrl);
    }
    if (!config) {
      config = getDefaultConfig(data);
    }

    // Process config to replace template variables
    config = processConfig(config, data);

    // Determine which image to use for ASCII art
    const imageUrl = config.image || data.avatarUrl;
    // Formats that support transparency: PNG, WebP, AVIF, GIF
    const transparentFormats = ['.png', '.webp', '.avif', '.gif'];
    const hasTransparency = imageUrl && transparentFormats.some(ext => imageUrl.toLowerCase().endsWith(ext));
    const useColoredAscii = config.coloredImage === true;

    // Convert image to ASCII art, fall back to default if it fails
    let asciiArt = DEFAULT_ASCII;
    let isCustomAscii = false;
    if (imageUrl) {
      const converted = await avatarToAscii(imageUrl, 25, 38, hasTransparency, useColoredAscii);
      if (converted) {
        asciiArt = converted;
        isCustomAscii = true;
      }
    }

    const svg = generateSvgWithConfig(data, config, asciiArt, isCustomAscii, theme);

    // Set cache headers (cache for 4 hours, stale-while-revalidate for 24 hours)
    res.setHeader('Cache-Control', 'public, max-age=14400, s-maxage=14400, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'image/svg+xml');
    res.status(200).send(svg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
