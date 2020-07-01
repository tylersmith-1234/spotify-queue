const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const db = require('./db');
const moment = require('moment');

const client_id = '8b1d748261f44f9d8355f33950df5081';
const client_secret = 'a83c847788fd4980ab62ddf0ae35c8f9';
const redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri
let access_token = '';
let refresh_token = '';
const app = express();
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'))
  .use(cors())
  .use(cookieParser());
app.use(bodyParser.urlencoded({extended: true}));
const stateKey = 'spotify_auth_state';
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

db.connect(() => {
  app.listen(8888, () => {
    console.log('listening on 8888');
    db.get('spotify').listCollections({name: 'queues'}).next((err, names) => {
      if (err) {
        db.get('spotify').createCollection('queues');
      }
    });
  });
});

app.get('/', function (req, res) {
  res.render('index');
});
app.get('/profile', function(req, res) {
  if (!!refresh_token) {
    reAuthorize((err, rbody) => {
      new_access = rbody.new_access;
      const opts = {
        url: 'https://api.spotify.com/v1/me',
        headers: { 'Authorization': 'Bearer '+new_access }
      };
      request.get(opts, (err, response, body) => {
        body = JSON.parse(body);
        const playlistopts = {
          url: `https://api.spotify.com/v1/users/${body.id}/playlists?limit=50&offset=0`,
          headers: { 'Authorization': 'Bearer '+new_access},
          offset: 0
        };
        new_body = getMore('GET', playlistopts, 50, 0, (b) => {
          db.get('spotify').collection('queues').find().toArray().then(array => {
            res.render('profile', {
              access_token: new_access, refresh_token,
              body, playlists: b.items, many_playlists: b.items.length>=50,
              queues: array});
          });
        });
        // request.get(playlistopts, (e, r, b) => {
        //   pls = JSON.parse(b).items;
        //   res.render('profile', {access_token: new_access, refresh_token, body, playlists: pls, many_playlists: pls.length==50});
        // });
      });
    });
  } else { // where we go if there is no authorization yet
    res.render('profile', {access_token: '', refresh_token: ''});
  }
});
app.get('/queue/:id', (req, res) => {
  const id = req.params.id;
  reAuthorize((err, body) => {
    db.get('spotify').collection('queues').findOne({playlist_id: id}).then(result => {
      res.render('queue', {queue: result, user: body.id, id: id});
    });
  });
});
function getMore(verb, options, limit, offset, callback) {
  // if (!options.offset && !offset.url.match('&offset=(\d+')) {
  //   options.offset = 0;
  //   options.url = options.url.concat(`&offset=${offset}`)
  // }
  return request.get(options, (error, response, body) => {
    body = JSON.parse(body);
    if (error || body.error) {
      return callback({'error': error||body.error});
    }
    if (body.items.length < limit) {
      return callback(body);
    } else {
      offset += limit;
      new_opts = {
        url: `https://api.spotify.com/v1/users/tylador/playlists?limit=50&offset=${offset}`,
        headers: options.headers,
        offset
      }
      return getMore(verb, new_opts, limit, offset+limit, (old_body) => {
        body.items = body.items.concat(old_body.items);
        return callback(body);
      });
    }
  });
}
app.post('/search', (req, res) => {
  if (!refresh_token) {
    res.redirect('/profile');
    return;
  }
  reAuthorize((err, rbody) => {
      access_token = rbody.new_access;
    var options = {
      url: `https://api.spotify.com/v1/search?q=${req.body.term}&type=track&market=US&limit=10&offset=0`,
      headers: { 'Authorization': 'Bearer '+access_token },
    };
    searchurl = options.url;
    request.get(options, function(error, response, body) {
      res.render('search', {term: req.body.term, songs: JSON.parse(body).tracks.items});
    });
  });
});

app.get('/spotlogin', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-read-private playlist-modify-public playlist-modify-private';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});
app.post('/addToPlaylist', (req, res) => {
  reAuthorize((err, body) => {
    const usr = body.id;
    const playlistopts = {
      url: `https://api.spotify.com/v1/users/${body.id}/playlists?limit=50&offset=0`,
      headers: { 'Authorization': 'Bearer '+body.new_access},
      offset: 0
    };
    // {playlist_id: {$in: b.items.map(p => p.id)}}
    new_body = getMore('GET', playlistopts, 50, 0, (b) => {
      db.get('spotify').collection('queues').find({$or: [
        {owner: usr}, {followers: {$elemMatch: {$eq: usr}}}]}).toArray().then(array => {
        res.render('addToPlaylist', {terms: req.body, access_token: body.new_access, refresh_token,
          playlists: b.items, queues: array});
      });
    });
  });
});
app.get('/addQueue', (req, res) => {
  if (!refresh_token) {
    res.redirect('/profile');
    return;
  }
  reAuthorize((err, body) => {
    const usr = body.id;
    const playlistopts = {
      url: `https://api.spotify.com/v1/users/${body.id}/playlists?limit=50&offset=0`,
      headers: { 'Authorization': 'Bearer '+body.new_access},
      offset: 0
    };
    // 
    new_body = getMore('GET', playlistopts, 50, 0, (b) => {
      db.get('spotify').collection('queues').find({playlist_id: {$in: b.items.map(p => p.id)}}).toArray().then(array => {
        b.items = b.items.filter(p => !array.map(a => a.playlist_id).includes(p.id));
        res.render('addQueue', {terms: req.body, access_token: body.new_access, refresh_token, playlists: b.items});
      });
    });
  });
});
app.post('/makeQueue', (req, res) => {
  const playlist_id = req.body.playlist_id;
  db.get('spotify').collection('queues').find({playlist_id: playlist_id}).toArray().then(array => {
    if (array.length > 0) {
      console.log('\x1b[43m', 'this playlist has already been made a queue.', "\x1b[0m");
      return;
    }
    reAuthorize((err, body) => {
      const opts = {
        url: `https://api.spotify.com/v1/playlists/${playlist_id}`,
        headers: { 'Authorization': 'Bearer '+body.new_access}
      };
      request.get(opts, (perr, pres) => {
        if (perr) {
          console.log(perr);
          process.exit(0);
        }
        const plist = JSON.parse(pres.body);
        db.get('spotify').collection('queues').insertOne({
          playlist_id: playlist_id,
          owner: body.id,
          name: plist.name,
          songs: [],
          followers: []
        });
      });
    });
  }).catch(reason => console.log(reason));
  res.redirect('/');
});
app.post('/addSong', (req, res) => {
  const songids = Object.keys(req.body).filter(i => i !== 'main' && i !== 'choose')[0]
    .split(',');
  if (req.body.main === 'playlists') {
    reAuthorize((err, body) => {
      const opts = {
        url: `https://api.spotify.com/v1/playlists/${req.body.choose}/tracks`,
        headers: { 'Authorization': 'Bearer '+body.new_access,
          'Content-Type': 'application/json'},
        body: `{"uris": ${JSON.stringify(songids.map(i => `spotify:track:${i}`))}}`
      };
      request.post(opts, (serr, sres, sbody) => {
        res.redirect('/');
      });
    });
  } else if (req.body.main === 'queues') {
    reAuthorize((err, body) => {
      let url = 'https://api.spotify.com/v1/tracks?ids=';
      songids.forEach(s => url = url.concat(s, '%2C'));
      url = url.substr(0, url.length-3);
      const opts = {
        url,
        headers: { 'Authorization': 'Bearer '+body.new_access,
          'Content-Type': 'application/json'}
      };
      request.get(opts, (serr, sres, sbody) => {
        if (serr) {
          console.log('issue getting songs from Spotify DB.');
          res.redirect('/');
        }
        const mongoSongsObject = [];
        JSON.parse(sbody).tracks.forEach(t => {
          mongoSongsObject.push({
            song_id: t.id,
            name: t.name,
            artists: t.artists.map(a => a.name),
            added_by: body.id,
            added_at: moment().format()
          });
        });
        db.get('spotify').collection('queues').updateOne({playlist_id: req.body.choose},
          {$push: {songs: {$each: mongoSongsObject}}
        });
        res.redirect('/');
      });
    });
  } else {
    console.log('no songs were added, something went wrong');
    res.redirect('/');
  }
});
app.get('/myQueues', (req, res) => {
  if (!refresh_token) {
    res.redirect('/profile');
    return;
  }
  reAuthorize((err, body) => {
    const usr = body.id;
    db.get('spotify').collection('queues').find({$or: [
      {owner: usr}, {followers: {$elemMatch: {$eq: usr}}}]}).toArray().then(result => {
      res.render('myQueues', {
        queues: result.filter(q => q.owner === usr),
        following: result.filter(q => q.owner !== usr),
        auth: body});
    });
  });
});
app.post('/approveSongs', (req, res) => {
  reAuthorize((err, body) => {
    const tracks = Object.keys(req.body).filter(k => !['choose', 'approve', 'reject'].includes(k)).map(k => `spotify%3Atrack%3A${k}`);
    let url = `https://api.spotify.com/v1/playlists/${req.body.choose}/tracks?uris=`;
    tracks.forEach(s => url = url.concat(s, '%2C'));
    url = url.substr(0, url.length-3);
    const opts = {
      url,
      headers: { 'Authorization': 'Bearer '+body.new_access,
        'Content-Type': 'application/json'}
    };
    db.get('spotify').collection('queues').updateOne({playlist_id: req.body.choose}, {
      $pull: {songs: {song_id: {$in: Object.keys(req.body).filter(k => k !== 'playlist')}}}
    },
    {multi: true}, (merr, mres) => {
      if (merr) {
        console.log('Request not processed, please try again');
        res.redirect('/myQueues');
        return;
      }
      if (Object.keys(req.body).includes('approve')) {
        request.post(opts, (serr, sres, sbody) => {
          if (serr) {
            console.log('Songs removed from queue but not posted to playlist.');
            return;
          }
          console.log('songs successfully added to playlist!');
          // res.redirect('/myQueues');
        });
      } else console.log('songs successfully removed from queue!');
      res.redirect('/myQueues');
    });
  });
});
app.post('/findQueue', (req, res) => {
  const playlist_id = req.body.id;
  reAuthorize((err, body) => {
    const usr = body.id;
    db.get('spotify').collection('queues').findOne({playlist_id: playlist_id}).then((obj) => {
      if (obj.owner === usr) {
        console.log('You cannot follow a playlist you own');
      } else {
        db.get('spotify').collection('queues').updateOne({_id: obj._id}, 
          {$push: {followers: usr}});
      }
      res.redirect('/');
    });
  });
});
app.get('/logout', (req, res) => {
  access_token = '';
  refresh_token = '';
  res.redirect('/');
});

function reAuthorize(callback) {
  get_new_token(refresh_token, (new_access, bod) => {
    access_token = new_access;
    const opts = {
      url: 'https://api.spotify.com/v1/me',
      headers: { 'Authorization': 'Bearer '+new_access }
    };
    request.get(opts, (err, response, body) => {
      if (err) {
        return callback(err);
      }
      body = JSON.parse(body);
      body.new_access = new_access;
      return callback(null, body);
    });
  });
}
app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    res.cookie(stateKey, state)
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        access_token = body.access_token;
        refresh_token = body.refresh_token;
        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});
async function get_new_token(refresh_token, callback) {
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      access_token = body.access_token;
      // res.send({
      //   'access_token': access_token
      // });
      return callback(access_token, body);
    }
  });
};
app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});