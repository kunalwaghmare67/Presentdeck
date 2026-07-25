import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const readSrc = (relPath) => fs.readFileSync(path.join(projectRoot, relPath), 'utf8');

const results = [];
let passCount = 0;
let failCount = 0;

function assert(condition, name, details) {
  if (condition) {
    passCount++;
    results.push({ name, status: 'PASS', details });
    console.log(`✓ [PASS] ${name}`);
  } else {
    failCount++;
    results.push({ name, status: 'FAIL', details });
    console.error(`✗ [FAIL] ${name}: ${details}`);
  }
}

console.log('--- EMPIRICAL STRESS TEST HARNESS (CHALLENGER 2 - MILESTONE 2 R2) ---\n');

// 1. CSS Global & Token Verification (index.css)
const indexCss = readSrc('src/index.css');
assert(indexCss.includes('--bg-primary: #313338;'), 'Global Index CSS: Primary Background Hex Token (#313338)', 'Expected --bg-primary: #313338');
assert(indexCss.includes('--panel-bg: #2b2d31;'), 'Global Index CSS: Panel Background Hex Token (#2b2d31)', 'Expected --panel-bg: #2b2d31');
assert(indexCss.includes('--panel-border: #1e1f22;'), 'Global Index CSS: Panel Border Hex Token (#1e1f22)', 'Expected --panel-border: #1e1f22');
assert(indexCss.includes('--accent: #5865f2;'), 'Global Index CSS: Accent Blurple Token (#5865f2)', 'Expected --accent: #5865f2');
assert(indexCss.includes('--cyan: #00a8fc;'), 'Global Index CSS: Focus Glow Cyan Token (#00a8fc)', 'Expected --cyan: #00a8fc');
assert(indexCss.includes('--green: #23a55a;'), 'Global Index CSS: Active Green Token (#23a55a)', 'Expected --green: #23a55a');
assert(indexCss.includes('--red: #f23f43;'), 'Global Index CSS: Destructive Red Token (#f23f43)', 'Expected --red: #f23f43');
assert(indexCss.includes('grid-template-columns: 260px 280px 1fr;'), 'Global Layout Grid Contract: 3-Column Width Specification (260px 280px 1fr)', 'Expected grid-template-columns: 260px 280px 1fr');

// 2. Component CSS Token Alignment
const pptCss = readSrc('src/components/PPTFlow.css');
assert(pptCss.includes('#2b2d31') && pptCss.includes('#1e1f22') && pptCss.includes('#35373c'), 'PPTFlow CSS: Discord Dark Color Tokens', 'Expected #2b2d31, #1e1f22, #35373c');
assert(pptCss.includes('#f0b232'), 'PPTFlow CSS: Key Slide Gold Highlight (#f0b232)', 'Expected gold highlight #f0b232');

const musicCss = readSrc('src/components/MusicFlow.css');
assert(musicCss.includes('#1e1f22') && musicCss.includes('#35373c') && musicCss.includes('var(--accent)'), 'MusicFlow CSS: Track & Now Playing Player Tokens', 'Expected #1e1f22, #35373c, var(--accent)');

const presCss = readSrc('src/components/PresentationArea.css');
assert(presCss.includes('#1e1f22') && presCss.includes('aspect-ratio: 16 / 9'), 'PresentationArea CSS: 16:9 Preview Aspect Ratio & Container Styling', 'Expected #1e1f22 and aspect-ratio 16/9');

const photoCss = readSrc('src/components/PhotoArea.css');
assert(photoCss.includes('#1e1f22') && photoCss.includes('#f23f43'), 'PhotoArea CSS: Grid Container & Delete Button Tokens', 'Expected #1e1f22 and delete button red #f23f43');

const videoCss = readSrc('src/components/VideoArea.css');
assert(videoCss.includes('#1e1f22') && videoCss.includes('#f23f43'), 'VideoArea CSS: Grid Container & Delete Button Tokens', 'Expected #1e1f22 and delete button red #f23f43');

const wfCss = readSrc('src/components/WorkflowManager.css');
assert(wfCss.includes('#2b2d31') && wfCss.includes('#1e1f22') && wfCss.includes('var(--accent)'), 'WorkflowManager CSS: Modal & Card Layout Dark Tokens', 'Expected modal container #2b2d31 and card #1e1f22');

const presScreenCss = readSrc('src/components/PresentingScreen.css');
assert(presScreenCss.includes('background: #000;'), 'PresentingScreen CSS: Pitch Black Display Background (#000)', 'Expected background: #000');

const loginCss = readSrc('src/components/LoginPage.css');
assert(loginCss.includes('background: #313338;') && loginCss.includes('background: #2b2d31;'), 'LoginPage CSS: Discord Background (#313338) & Card (#2b2d31)', 'Expected #313338 and #2b2d31');

// 3. Feature Contracts & Functional Mechanics in TSX Components
const appTsx = readSrc('src/App.tsx');
assert(appTsx.includes('className="layout-container"') && appTsx.includes('col-ppt') && appTsx.includes('col-music') && appTsx.includes('col-main'), 'App Layout Contract: 3-Column HTML Shell Preservation', 'Expected layout-container with col-ppt, col-music, col-main');
assert(appTsx.includes('DndContext') && appTsx.includes('DragOverlay'), 'App Drag-and-Drop Contract: DndContext & DragOverlay Integration', 'Expected DndContext and DragOverlay');

const pptTsx = readSrc('src/components/PPTFlow.tsx');
assert(pptTsx.includes('onToggleKey') || pptTsx.includes('toggleKeySlide'), 'PPTFlow Component Contract: Star Slide / Key Slide Toggle Logic', 'Expected key slide toggle handler');

const musicTsx = readSrc('src/components/MusicFlow.tsx');
assert(musicTsx.includes('togglePlay') && musicTsx.includes('handleSeek'), 'MusicFlow Component Contract: Audio Playback & Seeking Logic', 'Expected togglePlay and handleSeek');

const wfTsx = readSrc('src/components/WorkflowManager.tsx');
assert(wfTsx.includes('exportWorkflowFile') && wfTsx.includes('importWorkflowFile'), 'WorkflowManager Component Contract: Export & Import Workflow Routines', 'Expected export and import handlers');

console.log(`\n----------------------------------------------------------------------`);
console.log(`EMPIRICAL RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log(`----------------------------------------------------------------------`);

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
