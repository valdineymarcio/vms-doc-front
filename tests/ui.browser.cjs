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
    requests.push({path:url.pathname,search:url.search,method});
    if(method!=='OPTIONS' && !url.pathname.endsWith('/auth/login')) assert.equal(event.request.headers.Authorization || event.request.headers.authorization,'Bearer ui-test');
    let data;
    let binary=false;
    let status=200;
    if(url.pathname.endsWith('/auth/login')) data={token:'ui-test'};
    else if(url.pathname.endsWith('/auth/me')) data={id:'sender',name:'Ana Silva',email:'ana@example.test',role:'ADMIN'};
    else if(url.pathname === '/api/documents/search') {
        const title=(url.searchParams.get('title')||'').toLocaleLowerCase();
        const category=url.searchParams.get('categoryId');
        if(title==='falha') {status=500;data={message:'Busca temporariamente indisponível'};}
        else data=[{...doc,categoryId:'category'},{...doc,id:'outside',title:'Nota fiscal de serviços',categoryId:null}]
            .filter(item=>(!category || item.categoryId===category) && (!title || item.title.toLocaleLowerCase().includes(title)));
    }
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
    await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:method==='OPTIONS'?204:status,
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
    await send('Emulation.setFocusEmulationEnabled',{enabled:true});
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
    await waitFor("document.getElementById('sendDocumentIdSearch')?.value.includes('Contrato')");
    const requestCountBeforeSearch=requests.length;
    await evaluate("{const docs=document.getElementById('sendDocumentId'),recipients=document.getElementById('sendReceiverId');for(let i=0;i<150;i++){const d=new Option('Documento '+i,'document-'+i);d.dataset.label='Documento '+i;docs.add(d);const r=new Option('Pessoa '+i,'person-'+i);r.dataset.label='Pessoa '+i;r.dataset.detail='pessoa'+i+'@example.test';recipients.add(r);}const d=new Option('Relatório de execução','accent-doc');d.dataset.label='Relatório de execução';docs.add(d);}");
    await evaluate("document.getElementById('sendDocumentIdSearch').focus();document.getElementById('sendDocumentIdSearch').click()");
    assert.equal(await evaluate("document.querySelectorAll('#sendDocumentIdOptions [role=option]').length"),60);
    await evaluate("{const input=document.getElementById('sendDocumentIdSearch');input.value='relatorio execucao';input.dispatchEvent(new Event('input',{bubbles:true}));}");
    assert.equal(await evaluate("document.getElementById('sendDocumentId').value"),'');
    assert.equal(await evaluate("document.querySelectorAll('#sendDocumentIdOptions [role=option]').length"),1);
    await evaluate("document.getElementById('sendDocumentIdSearch').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
    assert.equal(await evaluate("document.getElementById('sendDocumentId').value"),'accent-doc');
    assert.equal(await evaluate("document.getElementById('sendDocumentIdSearch').validity.valid"),true);
    await evaluate("{const input=document.getElementById('sendReceiverIdSearch');input.focus();input.value='pessoa149@example.test';input.dispatchEvent(new Event('input',{bubbles:true}));}");
    assert.equal(await evaluate("document.querySelectorAll('#sendReceiverIdOptions [role=option]').length"),1);
    await evaluate("document.getElementById('sendReceiverIdSearch').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
    assert.equal(await evaluate("document.getElementById('sendReceiverId').value"),'person-149');
    await evaluate("document.getElementById('sendDocumentIdSearch').focus()");
    assert.equal(await evaluate("document.getElementById('sendDocumentIdSearch').getAttribute('aria-expanded')"),'true');
    await evaluate("{const input=document.getElementById('sendDocumentIdSearch');input.value='Documento 14';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}");
    assert.equal(await evaluate("document.getElementById('sendDocumentId').value"),'document-114');
    await evaluate("document.querySelector('#sendDocumentIdSearch').closest('.searchable-select').querySelector('.select-clear').click()");
    assert.equal(await evaluate("document.getElementById('sendDocumentId').value"),'');
    assert.equal(await evaluate("document.getElementById('sendDocumentIdSearch').value"),'');

    await evaluate("{const input=document.getElementById('sendReceiverIdSearch');input.value='ninguem-encontrado';input.dispatchEvent(new Event('input',{bubbles:true}));}");
    assert.equal(await evaluate("document.querySelector('#sendReceiverIdOptions .searchable-select-empty') !== null"),true);
    assert.equal(await evaluate("document.getElementById('sendReceiverId').value"),'');
    assert.equal(await evaluate("document.getElementById('sendButton').disabled"),true);
    assert.equal(await evaluate("document.getElementById('sendReceiverIdSearch').validity.valid"),false);
    await evaluate("document.getElementById('sendReceiverIdSearch').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
    assert.equal(await evaluate("document.getElementById('sendReceiverIdSearch').getAttribute('aria-expanded')"),'false');
    await evaluate("{const input=document.getElementById('sendDocumentIdSearch');input.value='contrato';input.dispatchEvent(new Event('input',{bubbles:true}));}");
    await screenshot('send-document-search');
    await evaluate("document.getElementById('sendDocumentIdSearch').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
    assert.equal(await evaluate("document.getElementById('sendDocumentId').value"),'doc-1');
    await evaluate("{const input=document.getElementById('sendReceiverIdSearch');input.focus();input.value='bruno@example.test';input.dispatchEvent(new Event('input',{bubbles:true}));}");
    await screenshot('send-recipient-search');
    await evaluate("document.querySelector('#sendReceiverIdOptions [role=option]').click()");
    assert.equal(await evaluate("document.getElementById('sendReceiverId').value"),'receiver');
    assert.equal(requests.length,requestCountBeforeSearch);
    await evaluate('clearSendForm()');
    await waitFor("document.getElementById('sendDocumentIdSearch').value==='' && document.getElementById('sendReceiverIdSearch').value===''");
    assert.equal(await evaluate("document.getElementById('sendButton').disabled"),true);
    await evaluate("document.getElementById('sendDocumentId').value='doc-1';document.getElementById('sendDocumentId').dispatchEvent(new Event('change'))");
    await evaluate("document.getElementById('sendDocumentId').disabled=true");
    await waitFor("document.getElementById('sendDocumentIdSearch').disabled");
    await evaluate("document.getElementById('sendDocumentId').disabled=false");
    await waitFor("!document.getElementById('sendDocumentIdSearch').disabled");

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
    await evaluate("document.getElementById('sendReceiverIdSearch').focus();document.getElementById('sendReceiverIdSearch').click()");
    assert.equal(await evaluate("(()=>{const r=document.querySelector('#sendReceiverIdSearch').closest('.searchable-select').querySelector('.searchable-select-popup').getBoundingClientRect();return r.left>=0 && r.right<=window.innerWidth;})()"),true);
    await screenshot('send-recipient-search-mobile');
    await evaluate("document.getElementById('sendReceiverIdSearch').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
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
    await send('Page.navigate',{url:base+'folders.html'});
    await waitFor("document.querySelector('#foldersGrid [data-category-id]') !== null");
    await evaluate("document.getElementById('folderDocumentSearch').value='nota';document.getElementById('folderSearchForm').requestSubmit()");
    await waitFor("document.getElementById('folderSearchFeedback').textContent.includes('1 documento encontrado')");
    assert.equal(await evaluate("document.querySelector('#categoryDocumentsTable tbody').textContent.includes('Nota fiscal')"),true);
    await evaluate("document.querySelector('#categoryDocumentsTable [data-document-view]').click()");
    await waitFor("document.querySelector('#documentPdfContainer canvas') !== null");
    assert.equal(requests.some(request => request.path === '/api/documents/outside/view'),true);
    await evaluate('closeDocumentViewer()');
    assert.equal(await evaluate("document.getElementById('folderDocumentSearch').value"),'nota');
    assert.equal(await evaluate("document.getElementById('folderSearchScope').value"),'');
    await evaluate("document.querySelector('#foldersGrid [data-category-id]').click()");
    await waitFor("document.getElementById('folderSearchFeedback').textContent.includes('0 documentos encontrados')");
    assert.equal(await evaluate("document.getElementById('expandFolderSearchButton').hidden"),false);
    assert.equal(await evaluate("document.getElementById('folderSearchScope').value"),'category');
    assert.equal(requests.some(request=>request.path==='/api/documents/search' && request.search.includes('title=nota') && request.search.includes('categoryId=category')),true);
    await screenshot('folder-search-empty-desktop');
    await evaluate("document.getElementById('expandFolderSearchButton').click()");
    await waitFor("document.getElementById('folderSearchFeedback').textContent.includes('1 documento encontrado')");
    assert.equal(await evaluate("document.getElementById('folderDocumentSearch').value"),'nota');
    assert.equal(await evaluate("document.getElementById('folderSearchScope').value"),'');
    await evaluate('clearFolderSearch()');
    await evaluate("document.querySelector('#foldersGrid [data-category-id]').click()");
    await waitFor("document.getElementById('folderSearchFeedback').textContent.includes('1 documento encontrado')");
    await evaluate("document.getElementById('folderDocumentSearch').value='Contrato';document.getElementById('folderSearchForm').requestSubmit()");
    await waitFor("document.getElementById('folderSearchFeedback').textContent.includes('Contrato') && !document.getElementById('folderSearchButton').disabled");
    await screenshot('folder-search-desktop');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
    assert.equal(await evaluate("(()=>{const rect=document.querySelector('#categoryDocumentsTable button').getBoundingClientRect();return rect.left>=0 && rect.right<=window.innerWidth;})()"),true);
    await screenshot('folder-search-mobile');
    assert.equal(await evaluate("(()=>{const buttons=[...document.querySelectorAll('#categoryDocumentsTable button')];return buttons.length===2 && buttons.every(button=>{const r=button.getBoundingClientRect();return r.left>=0 && r.right<=window.innerWidth;});})()"),true);
    await evaluate("document.querySelector('#categoryDocumentsTable [data-document-view]').click()");
    await waitFor("document.querySelector('#documentPdfContainer canvas') !== null");
    assert.equal(requests.some(request => request.path === '/api/documents/doc-1/view'),true);
    await screenshot('folder-document-view-mobile');
    await evaluate('closeDocumentViewer()');
    assert.equal(await evaluate("document.getElementById('mainDocumentViewerPanel').hidden"),true);
    assert.equal(await evaluate("document.getElementById('folderDocumentSearch').value"),'Contrato');
    assert.equal(await evaluate("document.getElementById('folderSearchScope').value"),'category');
    await evaluate("document.getElementById('folderDocumentSearch').value='falha';document.getElementById('folderSearchForm').requestSubmit()");
    await waitFor("document.getElementById('folderSearchFeedback').dataset.kind === 'error'");
    assert.equal(await evaluate("document.getElementById('folderDocumentsEmptyState').style.display"),'none');
    await evaluate('clearFolderSearch()');
    assert.equal(await evaluate("document.getElementById('folderSearchScope').value"),'category');
    await evaluate('closeSelectedFolder()');
    assert.equal(await evaluate("document.getElementById('folderDocumentsSection').style.display"),'none');
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
    console.log(JSON.stringify({passed:true,scenarios:['dashboard tabs','returned authenticated PDF','document deep link','optional sender signature','single send and sign','mobile navigation','six mobile screens without overflow','recipient signs and returns','upload and continue to send','direct returned link','dark theme','login form','setup screen','folder-scoped title search','expand search without losing query','global search includes uncategorized documents','clear and close folder search','folder search HTTP error','folder search mobile','view PDFs inside and outside folders without losing filters','searchable document and recipient fields','accent insensitive and email matching','150 options with bounded menu','keyboard selection and invalid free text','selection sync reset and disabled state','no network calls while filtering'],artifacts}));
})().catch(error=>{console.error(error);console.error(JSON.stringify({browserErrors,artifacts}));process.exitCode=1;}).finally(async()=>{
    if(socket?.readyState===1) {await send('Browser.close').catch(()=>{});socket.close();}
    browser.kill();
});
