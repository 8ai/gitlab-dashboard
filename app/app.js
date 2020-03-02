let {Tray, Menu, app, BrowserWindow, ipcMain, globalShortcut, Notification} = require('electron');
let fs = require('fs');
let url = require('url');
let util = require('util');
let path = require('path');
let http = require('http');
let https = require('https');
let childProcess = require('child_process');
let tray, logs, appWindow, int, allExit;
let settings = {}, list = [];
try{
	console.log('Read config', path.join(app.getPath('userData'), 'settings.json'));
   settings = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json')));
}catch(e){}

/*
https://docs.gitlab.com/ee/api/boards.html
https://www.electron.build/configuration/win
https://electronjs.org/docs/api/browser-window
https://electronjs.org/docs/tutorial/keyboard-shortcuts#горячие-клавиши-в-browserwindow
*/

console.originalError = console.error;
console.error = (...args)=>{
	logs && logs.write(new Date().toLocaleString('ru-RU') + ' - ERROR: ' + util.inspect(args) + '\r\n');
	console.originalError.call(console, ...args);
};

ipcMain.on('get', (event, data)=>{
	switch(data.type){
		case 'settings':
			event.returnValue = settings;
			break;
		case 'list':
			obtainList();
			break;
		case 'devTools':
			appWindow && appWindow.webContents.openDevTools();
			break;
	}

	event.returnValue = settings;
});
ipcMain.on('set', (event, data)=>{
	switch(data.type){
		case 'settings':
			settings = Object.assign(settings, data.settings);
			settings.gitlab_url = settings.gitlab_url && settings.gitlab_url.replace(/\/api\/v4\//, '');
			fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify(settings));
			break;
		case 'issue':
			updateIssue(data.issue);
			break;
	}
});

app.on('ready', () => {
	tray = new Tray(path.join(__dirname, '1691716.png'));
	tray.setToolTip('Gitlab issues board');
	tray.on('click', (ev, bounds, position)=>{
		console.log(ev, bounds, position);
		openWindow();
	});

	let contextMenu = Menu.buildFromTemplate([
		{
			label: 'Main window',
			click: () => {
				openWindow();
			}
		},
		{
			label: 'Logs',
			click: () => {
				childProcess.exec('explorer ' + path.join(app.getPath('temp'), 'usr.aidev.system.logs.txt'));
			}
		},
		{
			label: 'Exit',
			click: () => {
				allExit = true;
				appWindow && appWindow.close();
				logs && logs.end();
				app.quit();
			}
		}
	]);

  tray.setContextMenu(contextMenu);
  Menu.setApplicationMenu(null);

  console.log('create log file to append', path.join(app.getPath('temp'), 'usr.aidev.system.logs.txt'));
  logs = fs.createWriteStream(path.join(app.getPath('temp'), 'usr.aidev.system.logs.txt'), {flags: 'a'});

  openWindow();
});

function openWindow(){
	if(appWindow){
		console.log('curstat', appWindow.status);
		if(appWindow.status == 'show'){
			appWindow.hide();
		}
		else if(appWindow.status == 'hide'){
			appWindow.show();
		}
		return;
	}

	let shown = false;
	if(settings.gitlab_url || !settings.token){
		shown = true;
	}

	appWindow = new BrowserWindow({
		width: 1100,
		height: 600,
		center: true,
		show: shown,
		icon: '1691716.ico',
		webPreferences: {
      nodeIntegration: true
    }
	});
	appWindow.status = 'hide';
	appWindow.on('close', ev=>{
		if(allExit){
			return;
		}

		ev.preventDefault();
		appWindow.hide();
	});

	//appWindow.webContents.openDevTools();

	appWindow.loadURL(url.format({
		pathname: path.join(__dirname, 'system.html'),
		protocol: 'file:',
		slashes: true
	}));

	appWindow.on('closed', () => {
		appWindow = null;
	});
	appWindow.on('show', ev=>{
		appWindow.status = 'show';
		//console.log(appWindow.status, ev);
	});
	appWindow.on('hide', ev=>{
		appWindow.status = 'hide';
		//console.log(appWindow.status, ev);
	});
}


/*function request(path, opts, data, cb){
	let options = Object.assign(
		{method: 'get'},
		url.parse(settings.gitlab_url + '/api/v4/' + path),
		{headers: {'Private-Token': settings.token}},
		opts
	);
	//console.log(options);
	let type = options.protocol == 'https' ? https : http;
	let req = type.request(options, (res)=>{
		if(res.statusCode != 200){
			cb({error: 'wrong statusCode', statusCode: res.statusCode});
			res.resume();
			return;
		}

		res.setEncoding('utf8');
		let chanks = '';
		res.on('data', chank=>chanks+=chank);
		res.on('end', ()=>{
			try{
				chanks = JSON.parse(chanks);
				cb(null, chanks);
			}
			catch(e){
				cb(e);
			}
		});
	});
	if(data) req.write(data);
	req.end();
}*/