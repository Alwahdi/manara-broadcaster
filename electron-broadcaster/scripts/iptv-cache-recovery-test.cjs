const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{Readable}=require('node:stream');
const source=fs.readFileSync(require('node:path').join(__dirname,'../library/iptv.cjs'),'utf8');
const implementation=source.slice(source.indexOf('async function fetchCachedHlsResource('),source.indexOf('\nfunction touchHls('));
let now=0,broken=false,empty=false,hits=0;
const cache=new Map(),m={};
const fetchCached=vm.runInNewContext(implementation+'\nfetchCachedHlsResource',{
 Date:{now:()=>now},Buffer,HLS_RESOURCE_CACHE:cache,HLS_CACHEABLE_MAX_BYTES:100000,
 UPSTREAM_TIMEOUT_MS:1000,pruneHlsCache(){},metrics:()=>m,
 async fetchUpstream(){hits++;const stream=Readable.from([empty?'#EXTM3U\n':'#EXTM3U\n#EXTINF:2,\nsegment.ts\n']);stream.statusCode=broken?503:200;stream.headers={};return stream;},
 async readAll(stream){const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);},
 isPlaylistResponse:()=>true,playlistCacheLifetime:()=>1000,
 playlistContentIssue:(body)=>body.includes('segment.ts')?'':'no content',
});
(async()=>{
 const ch={id:'owned-test'},url='http://example.invalid/index.m3u8';
 const get=()=>fetchCached(ch,url,{},1000,12000);
 assert.equal((await get()).statusCode,200);
 broken=true;now=2000;assert.equal((await get()).stale,true);
 now=5000;assert.equal((await get()).stale,true);
 now=14000;assert.equal((await get()).statusCode,503,'repeated failures must not renew an old live playlist indefinitely');
 broken=false;empty=true;now=15000;
 await assert.rejects(get(),/no content/);
 empty=false;assert.equal((await get()).statusCode,200,'an empty playlist must not poison the cache');
 assert.ok(hits>=5);console.log('WIVA IPTV stale deadline and empty playlist tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
