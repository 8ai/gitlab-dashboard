ipcRenderer.on('set', (ev, data)=>{
  switch(data.type){
    case 'list': app.setList(data.list);break;
    case 'error': app.showError(data.error, data.for);break;
  }
});

window.addEventListener('keyup', ev=>{
  if(ev.code == 'F12') ipcRenderer.send('get', {type: 'devTools'});
  if(ev.code == 'KeyR' && ev.ctrlKey) app.init();
}, true);

window.addEventListener('click', ev=>{
  if(ev.target.classList.contains('error')){
    let width = ev.target.offsetWidth;
    let height = ev.target.offsetHeight;
    if(width - ev.layerX > 4  && width - ev.layerX < 29 && height - ev.layerY > 5 && height - ev.layerY < 29){
      app.error = null;
    }
  }
})

let app;
window.addEventListener('load', ev=>{
  app = new Vue({
    el: '#app',
    data: {
      settings: ipcRenderer.sendSync('get', {type: 'settings'}) || {},
      list: null,
      projects: [],
      users: [],
      boards: [],
      labels: {},
      assignee: {},
      move: {},
      error: null,
      keys: {
        showSettings: false,
        loading: 0,
        si: null
      },
    },
    methods: {
      init(){
        clearInterval(this.keys.si);
        let arr = [];
        if(this.settings.gitlab_url && this.settings.token){
          if(!this.projects.length){
            arr.push(this.getProjects());
          }
          if(!this.users.length){
            arr.push(this.getUsers());
          }

          if(this.settings.project){
            if(!this.labels.length){
              arr.push(this.getLabels());
            }
            if(!this.boards.length){
              arr.push(this.getBoards());
            }
          }
        }

        Promise.all(arr).then(d=>{
          this.getList();
          this.keys.si = setInterval(this.getList, this.settings.interval*1000 || 30000);
        }).catch(e=>{});
      },
      getLabels(){
        return new Promise((resolve, reject)=>{
          this.request('projects/' + this.settings.project + '/labels', null, null, (err, data)=>{
            if(err){
              this.showError(err, 'labels');
              return reject();;
            }

            this.setLabels(data);
            resolve();
          });
        });
      },
      getBoards(){
        return new Promise((resolve, reject)=>{
          this.request('projects/' + this.settings.project + '/boards', null, null, (err, data)=>{
            if(err){
              this.showError(err, 'boards');
              return reject();
            }

            this.setBoards(data);
            resolve();
          });
        });
      },
      getList(){
        if(!this.settings.project) return;
        
        return new Promise((resolve, reject)=>{
          this.request('projects/' + this.settings.project + '/issues', null, null, (err, data)=>{
            if(err){
              this.showError(err, 'list');
              return reject();
            }

            this.setList(data);
            resolve();
          });
        });
      },
      getUsers(){
        return new Promise((resolve, reject)=>{
          this.request('users', null, null, (err, data)=>{
            if(err) {
              this.showError(err, 'users');
              return reject();
            }

            this.setUsers(data);
            resolve();
          });
        });
      },
      getProjects(){
        return new Promise((resolve, reject)=>{
          this.request('projects', null, null, (err, data)=>{
            if(err) {
              this.showError(err, 'projects');
              return reject();
            }

            this.setProjects(data);
            resolve();
          });
        });
      },
      setBoards(data){
        this.boards = data || [];

        if(this.boards.length == 1){
          this.settings.board = this.boards[0].id;
          this.saveSettings();
        }
      },
      setProjects(data){
        this.projects = data || [];

        if(this.projects.length == 1){
          this.settings.project = this.projects[0].id;
          this.saveSettings();
        }
      },
      setLabels(data){
        this.labels = data.reduce((r,d)=>{
          r[d.name] = d;
          return r;
        }, {});
      },
      setUsers(data){
        this.users = data || [];
        data.unshift({username: '', name: ''});
      },
      setList(data){
        let init = !this.list;
        if(!this.boards.length) return;

        //console.log('setList', data);
        data = data || [];
        let keys = {
          Open: [],
          Closed: []
        };
        let lists = this.boards.filter(b=>b.id==this.settings.board)[0].lists.map(l=>{
          keys[l.label.name] = [];
          return {
            id: l.id,
            title: l.label.name
          };
        });
        lists.unshift({
          id: 0,
          title: 'Open'
        });
        lists.push({
          id: 1,
          title: 'Closed'
        });

        data.forEach(is=>{
          this.checkNeedNotify(is, init);

          if(is.state == 'closed'){
            return keys.Closed.push(is);
          }

          let add = false;
          if(is.labels && is.labels.length){
            is.labels.forEach(l=>{
              if(keys[l]){
                keys[l].push(is);
                add = true;
              }
            });
          }

          if(!add){
            keys.Open.push(is);
          }
        });

        let store = localStorage.hidden;
        if(store) try{store = JSON.parse(store)}catch(e){store = null}
        if(!store) store = {};

        this.list = lists.map(l=>{
          l.issues = keys[l.title];
          l.hidden = store[l.title] || false;
          return l;
        });
      },
      checkNeedNotify(issue, init){
        if(init){
          this.assignee[issue.id] = issue.assignee && issue.assignee.name || '#none';
          return;
        }

        let oldAssingee = this.assignee[issue.id];
        let newAssignee = issue.assignee && issue.assignee.name;

        if(!oldAssingee){
          if(this.settings.notifyAboutNew == 'any'){
            let notify = new Notification('New issue', {
              body: issue.title
            });
          }
          else if(this.settings.user && this.settings.notifyAboutNew == 'mine' && newAssignee == this.settings.user){
            let notify = new Notification('New issue to you', {
              body: issue.title
            });
          }
        }
        else if(oldAssingee != (newAssignee || '#none')){
          if(this.settings.notifyAboutChange == 'any'){
            if(this.settings.user && newAssignee == this.settings.user){
              let notify = new Notification('You have new issue', {
                body: issue.title
              });
            }
            else{
              let notify = new Notification('Issue changed assignee', {
                body: issue.title + ' new assignee ' + (newAssignee || 'none')
              });
            }
          }
          else if(this.settings.notifyAboutChange == 'mine' && this.settings.user){
            if(newAssignee == this.settings.user){
              let notify = new Notification('You have new issue', {
                body: issue.title
              });
            }
            else if(oldAssingee == this.settings.user && newAssignee != this.settings.user){
              let notify = new Notification('Your lost the issue', {
                body: issue.title + ' assigned to ' + (newAssignee || 'none')
              });
            }
          }
        }

        this.assignee[issue.id] = newAssignee || '#none';
      },
      saveSettingsAndTryLoadProjects(ev){
        if(this.settings.interval*1000 < 500){
          this.settings.interval = 30000;
        }
        this.saveSettings();

        if(!this.projects.length && this.settings.gitlab_url && this.settings.token){
          this.getProjects();
        }

        if(!this.users.length && this.settings.gitlab_url && this.settings.token){
          this.getUsers();
        }
      },
      selectProject(ev){
        this.settings.project = ev.target.value;
        this.saveSettings();
        this.getLabels();
        this.getBoards();
      },
      selectBoard(ev){
        this.settings.board = ev.target.value;
        this.saveSettings();
      },
      selectUser(ev){
        this.settings.user = ev.target.value;
        this.saveSettings();
      },
      open(row){
        shell.openExternal(row.web_url);
      },
      saveSettings(ev){
        ipcRenderer.send('set', {type: 'settings', settings: this.settings});
      },
      setNotificationLevel(ev, type){
        if(type=='new') this.settings.notifyAboutNew = ev.target.value;
        if(type=='change') this.settings.notifyAboutChange = ev.target.value;
        this.saveSettings();
      },
      showError(err, type){
        this.error = err;
      },
      wheel(ev){
        if(ev.path && ev.path.filter(el=>el != ev.currentTarget && el.offsetHeight < el.scrollHeight).length) return;
        if(ev.deltaY > 0) ev.currentTarget.scrollLeft += 100;
        else ev.currentTarget.scrollLeft -= 100;
      },
      dragndrop(ev, type, board, issue){
        if(type == 'start'){
          Vue.set(issue, 'move', true);
          this.move = {board, issue, el: ev.target};
        }
        else if(type == 'end'){
          if(this.move.issue) this.move.issue.move = false;
        }
        else if(type == 'enter'){
          if(this.move.board.id != board.id && !board.issues.filter(i=>i.id==this.move.issue.id).length){
            board.issues.push(Object.assign({}, this.move.issue, {temp: true}));
          }
        }
        else if(type == 'leave'){
          if(ev.relatedTarget && ev.relatedTarget.classList.contains('cols')){
            board.issues = board.issues.filter(issue=>!issue.temp);
          }
        }
        else if(type == 'over'){
          ev.preventDefault();
          return false;
        }
        else if(type == 'drop' ){
          ev.stopPropagation();
          ev.preventDefault();
          if(ev.dataTransfer.files.length || this.keys.loading){
            this.move.issue.move = false;
            return;
          }

          if(this.move.board.id != board.id){
            this.updateIssue(ev, this.move.issue, {to: board.title, from: this.move.board.title}, ()=>{
              this.getList();
            });
          }
          this.move = {};
        }
      },
      updateIssue(ev, issue, change, cb){
        let oldLabels = issue.labels;
        oldLabels.sort();
        let url = [];

        if(change.to == 'Closed'){
          url.push('state_event=close');
          url.push('labels=' + issue.labels.filter(label=>!this.labels[label]).join(','));
        }
        else{
          if(issue.state == 'closed'){
            url.push('state_event=reopen');
          }

          let newLabels = issue.labels.filter(label=>label != change.from);
          if(this.labels[change.to]){
            newLabels.push(change.to);
          }

          url.push('labels=' + newLabels.join(','));
        }

        url = url.join('&');
        
        this.request('projects/' + this.settings.project + '/issues/' + issue.iid, null, null, (err, data)=>{
          data = data && data[0];
          if(err || data && data.message){
            if(data && data.message) err = data.message;
            return this.showError(err, 'list');
          }

          let newLabels = data.labels;
          newLabels.sort();

          if(oldLabels.join(',') != newLabels.join(',')){
            return this.showError('Someoune change issue, labels', 'list');
          }

          if(issue.state != data.state){
            return this.showError('Someoune change issue, state', 'list');
          }

          this.request('projects/' + this.settings.project + '/issues/' + issue.iid + '?' + url, null, {method: 'PUT'}, (err, data)=>{
            if(err){
              return this.showError(err, 'list');
            }

            cb();
          });
        });
      },
      hide(ev, col){
        if(!col.hidden){
          col.hidden = true;
        }
        else{
          col.hidden = false;
        }

        let store = localStorage.hidden;
        if(store) try{store = JSON.parse(store)}catch(e){store = null}
        if(!store) store = {};
        store[col.title] = col.hidden;

        localStorage.hidden = JSON.stringify(store);
      },
      request(url, data=null, conf={}, cb){
        let headers = Object.assign({'Private-Token': this.settings.token}, conf && conf.headers);
        let callback = (err, data)=>{
          this.keys.loading--;
          cb(err, data);
        }
        this.keys.loading++;
        let response = [];
        let run = (page)=>{
          try{
            let req = new XMLHttpRequest();
            page = page && (/\?$/.test(url) ? '&' : '?') + 'page=' + page || '';
            req.open(conf && conf.method||'GET', this.settings.gitlab_url + '/api/v4/' + url + page, true);
            Object.keys(headers).map(key=>{
              req.setRequestHeader(key, headers[key]);
            });
            req.onload = function(ev){
              if(this.status == 200){
                response = response.concat(JSON.parse(this.response));
                let nextPage = this.getResponseHeader('x-next-page');
                if(!nextPage){
                  return callback(null, response);
                }

                return run(nextPage);
              }

              callback(ev);
            };
            req.onerror = callback;
            req.onabort = callback;
            req.send(data);
          }catch(e){
            console.log(e);
            callback(e);
          }
        };
        run();
        // let req = fetch(this.settings.gitlab_url + '/api/v4/' + url, options)
        //   .then(d=>d.json())
        //   .then(d=>cb(null, d, req))
        //   .catch(e=>cb(e, null, req))
        //   .then(d=>this.keys.loading--);
      }
    },
    mounted(){
      this.$nextTick(()=>{
        if(!this.settings.gitlab_url || !this.settings.token){
          this.keys.showSettings = true;
        }
        this.init();
      });
    }
  });
});