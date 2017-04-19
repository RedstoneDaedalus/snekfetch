require('stream');
const zlib = require('zlib');
const http = require('http');
const https = require('https');
const URL = require('url');
const Package = require('../package.json');
const Stream = require('stream');

class Snekfetch extends Stream.Readable {
  constructor(method, url, opts = { headers: {}, data: null }) {
    super();

    const options = this.options = URL.parse(url);
    options.method = method.toUpperCase();
    options.headers = opts.headers;
    this.data = opts.data;

    this.request = (options.protocol === 'https:' ? https : http).request(options);
  }

  set(name, value) {
    if (name !== null && typeof name === 'object') {
      for (const key of Object.keys(name)) this.set(key, name[key]);
    } else {
      // If your server can't handle header names being lowercase then like, fuck you.
      this.request._headers[name.toLowerCase()] = value;
      this.request._headerNames[name.toLowerCase()] = name;
    }
    return this;
  }

  attach(name, data, filename) {
    const form = this._getFormData();
    this.set('Content-Type', `multipart/form-data; boundary=${form.boundary}`);
    form.append(name, data, filename);
    this.data = form;
    return this;
  }

  send(data) {
    if (typeof data === 'object') {
      this.set('Content-Type', 'application/json');
      this.data = JSON.stringify(data);
    } else {
      this.data = data;
    }
    return this;
  }

  then(resolver, rejector) {
    return new Promise((resolve, reject) => {
      const request = this.request;

      function handleError(err) {
        if (!err) err = new Error('Unknown error occured');
        err.request = request;
        reject(err);
      }

      request.on('abort', handleError);
      request.on('aborted', handleError);
      request.on('error', handleError);

      request.on('response', (response) => {
        const stream = new Stream.PassThrough();
        if (this._shouldUnzip(response)) {
          response.pipe(zlib.createUnzip({
            flush: zlib.Z_SYNC_FLUSH,
            finishFlush: zlib.Z_SYNC_FLUSH,
          })).pipe(stream);
        } else {
          response.pipe(stream);
        }

        let body = [];

        stream.on('data', (chunk) => {
          if (!this.push(chunk)) this.pause();
          body.push(chunk);
        });

        stream.on('end', () => {
          this.push(null);
          const concated = Buffer.concat(body);

          if (this._shouldRedirect(response)) {
            if ([301, 302].includes(response.statusCode)) {
              this.method = this.method === 'HEAD' ? 'HEAD' : 'GET';
              this.data = null;
            }

            if (response.statusCode === 303) this.method = 'GET';
            const headers = {};
            for (const name of Object.keys(this.request._headerNames)) {
              headers[this.request._headerNames[name]] = this.request._headers[name];
            }
            resolve(new Snekfetch(
              this.method,
              URL.resolve(this.options.href, response.headers.location),
              { data: this.data, headers }
            ));
            return;
          }

          const res = {
            request: this.options,
            body: concated,
            text: concated.toString(),
            ok: response.statusCode >= 200 && response.statusCode < 300,
            headers: response.headers,
            status: response.statusCode,
            statusText: response.statusText || http.STATUS_CODES[response.statusCode],
            url: this.options.href,
          };

          const type = response.headers['content-type'];
          if (type) {
            if (type.includes('application/json')) {
              try {
                res.body = JSON.parse(res.text);
              } catch (err) {} // eslint-disable-line no-empty
            } else if (type.includes('application/x-www-form-urlencoded')) {
              res.body = {};
              for (const [k, v] of res.text.split('&').map(q => q.split('='))) res.body[k] = v;
            }
          }

          if (res.ok) {
            resolve(res);
          } else {
            const err = new Error(`${res.status} ${res.statusText}`.trim());
            Object.assign(err, res);
            reject(err);
          }
        });
      });

      this._addFinalHeaders();
      request.end(this.data ? this.data.end ? this.data.end() : this.data : null);
    })
    .then(resolver, rejector);
  }

  catch(rejector) {
    return this.then(null, rejector);
  }

  end(cb) {
    return this.then(
      (res) => cb ? cb(null, res) : res,
      (err) => cb ? cb(err, err.status ? err : null) : err
    );
  }

  _read() {
    this.resume();
    if (this.request.res) return;
    this.catch((err) => this.emit('error', err));
  }

  _shouldUnzip(res) {
    if (res.statusCode === 204 || res.statusCode === 304) return false;
    if (res.headers['content-length'] === '0') return false;
    return /^\s*(?:deflate|gzip)\s*$/.test(res.headers['content-encoding']);
  }

  _shouldRedirect(res) {
    return [301, 302, 303, 307, 308].includes(res.statusCode);
  }

  _getFormData() {
    if (!this._formData) this._formData = new FormData();
    return this._formData;
  }

  _addFinalHeaders() {
    if (!this.request || !this.request._headers) return;
    if (!this.request._headers['user-agent']) {
      this.set('User-Agent', `snekfetch/${Snekfetch.version} (${Package.repository.url.replace(/\.?git/, '')})`);
    }
    if (this.request.method !== 'HEAD') this.set('Accept-Encoding', 'gzip, deflate');
  }
}

Snekfetch.version = Package.version;

Snekfetch.METHODS = http.METHODS.concat('BREW');
for (const method of Snekfetch.METHODS) {
  Snekfetch[method === 'M-SEARCH' ? 'msearch' : method.toLowerCase()] = (url) => new Snekfetch(method, url);
}

if (typeof module !== 'undefined') module.exports = Snekfetch;
else if (typeof window !== 'undefined') window.Snekfetch = Snekfetch;
