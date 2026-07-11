const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const home = read('webui/src/screens/viewer/Home.tsx');
const live = read('webui/src/screens/viewer/Live.tsx');
const guide = read('webui/src/screens/viewer/LiveGuide.tsx');
const search = read('webui/src/screens/viewer/Search.tsx');
const library = read('webui/src/screens/viewer/LibraryFolders.tsx');
const common = read('webui/src/components/common.tsx');
const productStyles = read('webui/src/styles/viewer-product.css');

assert.doesNotMatch(home, /quick-action|device-preview|viewer-stats/);
assert.doesNotMatch(`${live}\n${guide}`, /live-feature-card|quality-badge|getChannelQualityLabel/);
assert.doesNotMatch(common, /شاهد الآن|quality-badge|channel-card-description/);
assert.doesNotMatch(search, /search-hero|autoFocus/);
assert.match(search, /\/library\/folders\?sourceId=/);
assert.match(library, /viewer-page-intro library-intro/);
assert.doesNotMatch(library, /library-hero-orbits|className="library-stats"/);
assert.match(productStyles, /@media \(max-width: 700px\)/);
assert.match(productStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(productStyles, /\.viewer-footer\s*\{[\s\S]*?display: none/);

console.log('WIVA public viewer layout tests passed');
