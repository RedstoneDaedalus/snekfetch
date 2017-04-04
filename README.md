# snekfetch

Just do http requests without all that weird nastiness from other libs

response.text is raw and always present  
response.body will be a buffer or an object and is not always present

you can `end` or `then` or `catch` a request just like superagent.  
You can also await it.  
It extends Stream.Readable.

```js
const snekfetch = require('snekfetch');

snekfetch.get('https://s.gus.host/o-SNAKES-80.jpg')
  .then(r => fs.writeFile('download.jpg', r.body));

snekfetch.get('https://s.gus.host/o-SNAKES-80.jpg')
  .pipe(fs.createWriteStream('download.jpg'));
```

```js
const snekfetch = require('snekfetch');

snekfetch.post('https://httpbin.org/post')
  .send({ meme: 'dream' })
  .then(r => console.log(r.body));
```
