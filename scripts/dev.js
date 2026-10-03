import http from 'node:http';
import {readFile} from 'node:fs/promises';
const api={};
for(const name of ['extract','plan','community','photos','stats','trip','share'])api[name]=(await import(`../api/${name}.js`)).default;
import {geminiReply} from '../tests/fixtures.js';
const demo=process.argv.includes('--demo');
if(demo){
 process.env.GEMINI_API_KEY='local-fixture-only';
 delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;delete process.env.SUPABASE_SERVICE_KEY;
 delete process.env.REDDIT_CLIENT_ID;delete process.env.UNSPLASH_ACCESS_KEY;
 globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))throw new Error('Demo external request blocked'); // photos fall back to illustrations
  const body=JSON.parse(options.body),prompt=body.contents[0].parts.at(-1).text;
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(geminiReply(prompt))}]}}]});
 };
}
const publicFiles={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const route=url.pathname.startsWith('/t/')?'share':url.pathname.match(/^\/api\/(\w+)$/)?.[1];
 if(route==='share'&&url.pathname.startsWith('/t/'))url.searchParams.set('id',url.pathname.slice(3));
 if(route&&api[route]){
  let chunks='',tooLarge=false;
  for await(const chunk of req){chunks+=chunk;if(chunks.length>50000){tooLarge=true;break;}}
  if(tooLarge){res.writeHead(413);return res.end('Request too large');}
  const result={status(code){res.statusCode=code;return this;},setHeader(k,v){res.setHeader(k,v);return this;},
   json(data){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));},send(body){res.end(body);}};
  try{await api[route]({method:req.method,body:chunks,headers:req.headers,url:url.pathname+url.search,query:Object.fromEntries(url.searchParams)},result);}
  catch{res.writeHead(500);res.end('Local server error');}
  return;
 }
 if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
 const file=publicFiles[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}
 try{
  let content=await readFile(new URL('../'+file[0],import.meta.url),'utf8');
  if(demo&&file[0]==='index.html')content=content.replace('<body>','<body><div style="padding:10px;text-align:center;background:#f7e9c8;color:#573f1b;font:13px system-ui">LOCAL PREVIEW · Sample Lisbon recommendations · No live AI or database calls</div>');
  res.setHeader('Content-Type',file[1]+'; charset=utf-8');res.end(content);
 }catch{res.writeHead(500);res.end('Could not read the page');}
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('WanderMap local '+(demo?'fixture preview':'server')+' at http://127.0.0.1:'+(Number(process.env.PORT)||4173)));
