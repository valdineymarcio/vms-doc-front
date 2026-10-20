// Browser smoke test with isolated session and intercepted API; never modifies the real backend.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
const base = process.env.UI_TEST_BASE || 'http://localhost:5500/frontend/';
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(),'vms-ui-preview-'));
const browser = spawn(process.env.UI_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',[
    '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
    '--user-data-dir=' + path.join(artifacts,'profile'),'about:blank'
],{windowsHide:true,stdio:'ignore'});
let socket;
const pending = new Map();
const browserErrors = [];
const requests = [];
let sequence = 0;
let signed = false;
const doc = {id:'doc-1',title:'Contrato de prestação de serviços',originalFilename:'contrato-servicos.pdf',createdAt:'2026-10-20T10:00:00Z'};
const transfer = {id:'transfer-1',documentId:doc.id,documentTitle:doc.title,senderId:'sender',senderName:'Ana Silva',receiverName:'Bruno Souza',status:'RETURNED'};
function pdfBuffer() {
    const content='BT /F1 16 Tf 60 740 Td (Contrato de servicos) Tj 0 -40 Td (Documento para revisao e assinatura.) Tj ET';
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream'];
    let pdf='%PDF-1.4\n'; const offsets=[0];
    objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(index+1)+' 0 obj\n'+object+'\nendobj\n';});
    const xref=Buffer.byteLength(pdf);
    pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
    return Buffer.from(pdf);
}
async function send(method,params={}) {
    const id=++sequence;
    const result=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
    socket.send(JSON.stringify({id,method,params}));
    return result;
}
async function evaluate(expression) {
    const value=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(value.exceptionDetails) throw Error(value.exceptionDetails.text+': '+(value.exceptionDetails.exception?.description||''));
    return value.result.value;
}
async function waitFor(expression) {
    for(let attempt=0;attempt<100;attempt++) {
        try { if(await evaluate(expression)) return; } catch {}
        await delay(100);
    }
    throw Error('Timed out: '+expression);
}
async function screenshot(name) {
    const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));
}
async function route(event) {
    const url=new URL(event.request.url);
    const method=event.request.method;
    requests.push({path:url.pathname,method});
    if(method!=='OPTIONS' && !url.pathname.endsWith('/auth/login')) assert.equal(event.request.headers.Authorization || event.request.headers.authorization,'Bearer ui-test');
    let data;
    let binary=false;
    if(url.pathname.endsWith('/auth/login')) data={token:'ui-test'};
    else if(url.pathname.endsWith('/auth/me')) data={id:'sender',name:'Ana Silva',email:'ana@example.test',role:'ADMIN'};
    else if(url.pathname.endsWith('/view')) {data=pdfBuffer();binary=true;}
    else if(url.pathname.endsWith('/recipients')) data=[{id:'receiver',name:'Bruno Souza',email:'bruno@example.test'}];
    else if(url.pathname.endsWith('/inbox')) data=[{...transfer,id:'received-1',senderName:'Carlos Lima',status:signed?'RETURNED':'SENT',sentAt:'2026-10-20T09:00:00Z'}];
    else if(url.pathname.endsWith('/returned')) data=[transfer];
    else if(url.pathname.endsWith('/send')) data={id:'new-transfer',status:'SENT'};
    else if(url.pathname.endsWith('/sign-sender')) data={id:'new-transfer',status:'SENT'};
    else if(url.pathname.endsWith('/sign')) {signed=true;data={id:'received-1',status:'RETURNED'};}
    else if(url.pathname.endsWith('/categories')) data=[{id:'category',name:'Contratos',description:'Acordos e contratos da empresa'}];
    else if(url.pathname.endsWith('/users')) data=[{id:'sender',name:'Ana Silva',email:'ana@example.test',role:'ADMIN',active:true}];
    else if(url.pathname.endsWith('/audit')) data=[];
    else if(url.pathname.includes('/documents')) data=method==='POST'?doc:[doc];
    else data=[];
    const payload=method==='OPTIONS'?Buffer.alloc(0):binary?data:Buffer.from(JSON.stringify(data));
    await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:method==='OPTIONS'?204:200,
        responseHeaders:[{name:'Content-Type',value:binary?'application/pdf':'application/json'},
            {name:'Access-Control-Allow-Origin',value:new URL(base).origin},
            {name:'Access-Control-Allow-Headers',value:'Authorization, Content-Type'},
            {name:'Access-Control-Allow-Methods',value:'GET,POST,PATCH,OPTIONS'}],body:payload.toString('base64')});
}
(async()=>{
    let port;
    for(let i=0;i<100;i++) {
        const active=path.join(artifacts,'profile','DevToolsActivePort');
        if(fs.existsSync(active)) {port=fs.readFileSync(active,'utf8').split('\n')[0];break;}
        await delay(100);
    }
    if(!port)throw Error('Browser did not start');
    const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
    socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    socket.onmessage=async event=>{
        const data=JSON.parse(event.data);
        if(data.id) {const promise=pending.get(data.id);pending.delete(data.id);if(data.error)promise?.reject(Error(data.error.message));else promise?.resolve(data.result);}
        else if(data.method==='Fetch.requestPaused') route(data.params).catch(error=>{browserErrors.push(error.message);send('Fetch.failRequest',{requestId:data.params.requestId,errorReason:'Failed'}).catch(()=>{});});
        else if(data.method==='Runtime.exceptionThrown')browserErrors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Fetch.enable',{patterns:[{urlPattern:'http://localhost:8080/*',requestStage:'Request'}]});
    await send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('token','ui-test');localStorage.setItem('vmsdocs-theme','light');"});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:base+'dashboard.html'});
    await waitFor("document.getElementById('totalDocuments')?.textContent === '1'");
    assert.equal(await evaluate("document.querySelector('[data-dashboard-panel]:not([hidden])').id"),'documents');
    await screenshot('dashboard-desktop');
    await evaluate("document.querySelector('[data-dashboard-tab=returnedDocuments]').click()");
    await waitFor("!document.getElementById('returnedDocuments').hidden");
    assert.equal(await evaluate("document.getElementById('documents').hidden"),true);
    await screenshot('returned-desktop');
    await evaluate("document.querySelector('#returnedTable button').click()");
    await waitFor("document.querySelector('#returnedPdfContainer canvas') !== null");
    assert.equal(requests.some(request=>request.path==='/api/transfers/transfer-1/view'),true);
    await evaluate('closeDocumentViewer()');
    assert.equal(await evaluate("document.getElementById('returnedViewerPanel').hidden"),true);
    await send('Page.navigate',{url:base+'send.html?documentId=doc-1'});
    await waitFor("document.getElementById('sendDocumentId')?.value === 'doc-1'");
    assert.equal(await evaluate("document.getElementById('sendButton').disabled"),true);
    await evaluate("document.getElementById('sendReceiverId').value='receiver';document.getElementById('sendReceiverId').dispatchEvent(new Event('change'))");
    assert.equal(await evaluate("document.getElementById('sendButton').disabled"),false);
    await screenshot('send-desktop');
    await evaluate("document.getElementById('includeSenderSignature').click()");
    await waitFor("document.querySelector('#embeddedPdfContainer canvas') !== null");
    assert.equal(await evaluate("document.getElementById('sendButton').disabled"),true);
    await evaluate("{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('click',{clientX:r.left+100,clientY:r.top+200,bubbles:true}));}");
    assert.equal(await evaluate("document.getElementById('sendButton').disabled"),false);
    assert.equal(await evaluate("document.getElementById('senderSignatureSummary').hidden"),false);
    await screenshot('signature-desktop');
    await evaluate("document.getElementById('confirmOwnSignBtn').click()");
    await waitFor("document.getElementById('sendMsg').textContent.includes('sucesso')");
    assert.equal(requests.filter(request=>request.path.endsWith('/send')&&request.method==='POST').length,1);
    assert.equal(requests.filter(request=>request.path.endsWith('/sign-sender')&&request.method==='PATCH').length,1);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await screenshot('send-mobile');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
    await evaluate("document.getElementById('navigationToggle').click()");
    assert.equal(await evaluate("document.body.classList.contains('navigation-open')"),true);
    await screenshot('navigation-mobile');
    for(const file of ['inbox.html','upload.html','folders.html','categories.html','users.html','audit.html']) {
        await send('Page.navigate',{url:base+file});
        await waitFor("window.location.pathname.endsWith('"+file+"') && document.readyState==='complete' && currentUser !== null");
        await delay(200);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,file+' mobile overflow');
        await screenshot(file.replace('.html','')+'-mobile');
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:base+'inbox.html'});
    await waitFor("document.querySelector('#inboxTable button') !== null");
    await evaluate("document.querySelector('#inboxTable button').click()");
    await waitFor("document.querySelector('#embeddedPdfContainer canvas') !== null");
    await evaluate("{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('click',{clientX:r.left+100,clientY:r.top+300,bubbles:true}));}");
    assert.equal(await evaluate("document.getElementById('confirmSignBtn').disabled"),false);
    await evaluate('confirmEmbeddedSignature()');
    assert.equal(signed,true);
    await screenshot('inbox-completed');
    await send('Page.navigate',{url:base+'upload.html'});
    await waitFor("window.location.pathname.endsWith('upload.html') && document.readyState==='complete' && currentUser !== null");
    const fixture=path.join(artifacts,'sample.pdf');
    fs.writeFileSync(fixture,pdfBuffer());
    const tree=await send('DOM.getDocument');
    const fileInput=await send('DOM.querySelector',{nodeId:tree.root.nodeId,selector:'#file'});
    await send('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[fixture]});
    assert.equal(await evaluate("document.getElementById('title').value"),'sample');
    await evaluate("document.getElementById('uploadForm').requestSubmit()");
    await waitFor("!document.getElementById('uploadNextActions').hidden");
    assert.equal(await evaluate("document.getElementById('sendUploadedDocument').href.endsWith('send.html?documentId=doc-1')"),true);
    await send('Page.navigate',{url:base+'dashboard.html#returnedDocuments'});
    await waitFor("document.getElementById('returnedDocumentsCount')?.textContent === '1'");
    assert.equal(await evaluate("document.getElementById('returnedDocuments').hidden"),false);
    await evaluate("setTheme('dark')");
    await waitFor("!document.getElementById('refreshReturnedBtn').disabled");
    await screenshot('dashboard-dark');
    assert.equal(await evaluate("document.documentElement.getAttribute('data-theme')"),'dark');
    await send('Page.navigate',{url:base+'index.html'});
    await waitFor("window.location.pathname.endsWith('index.html') && document.readyState === 'complete'");
    assert.equal(await evaluate("getComputedStyle(document.getElementById('msg')).display"),'none');
    await screenshot('login-desktop');
    await evaluate("document.getElementById('email').value='ana@example.test';document.getElementById('password').value='example';document.querySelector('form').requestSubmit()");
    await waitFor("window.location.pathname.endsWith('dashboard.html') && currentUser !== null");
    await send('Page.navigate',{url:base+'create-admin.html'});
    await waitFor("window.location.pathname.endsWith('create-admin.html') && document.readyState === 'complete'");
    await screenshot('setup-desktop');
    assert.deepEqual(browserErrors,[]);
    console.log(JSON.stringify({passed:true,scenarios:['dashboard tabs','returned authenticated PDF','document deep link','optional sender signature','single send and sign','mobile navigation','six mobile screens without overflow','recipient signs and returns','upload and continue to send','direct returned link','dark theme','login form','setup screen'],artifacts}));
})().catch(error=>{console.error(error);console.error(JSON.stringify({browserErrors,artifacts}));process.exitCode=1;}).finally(async()=>{
    if(socket?.readyState===1) {await send('Browser.close').catch(()=>{});socket.close();}
    browser.kill();
});
