const express = require("express");
const app = express();
const pgp = require("pg-promise")();
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { URLSearchParams } = require("url");

// database configuration
const dbConfig = {
  host: "db",
  port: 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
};

const db = pgp(dbConfig);

// test your database
db.connect()
  .then((obj) => {
    console.log("Database connection successful"); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch((error) => {
    console.log("ERROR:", error.message || error);
  });

app.set("view engine", "ejs");

app.use(bodyParser.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
var access_token = "";
var refresh_token = "";

app.get("/", (req, res) => {
  // console.log("/ route");
  // res.send('home');
  res.render("pages/index"); // index is the first/welcome page for the / route
});

app.get("/home", (req, res) => {
  // console.log("/ route");
  // res.send('home');
  res.render("pages/home");
});

app.get("/login", (req, res) => {
  // console.log("/login");
  // res.send('home');
  res.render("pages/login");
});

app.post("/login", async (req, res) => {
  const username = req.body.username;
  const query = `SELECT * FROM users WHERE spotify_username = '${username}';`;
  console.log("attempting to login");

  db.any(query)
    .then(async (data) => {
      console.log("@@@@", data);
      if (data.length > 0) {
        // console.log("data@", data[0]);
        const match = await bcrypt.compare(
          data[0].spotify_username,
          data[0].spotify_password
        ); //await is explained in #8

        if (!match) {
          return console.log("Incorrect username or password.");
        } else {
          req.session.user = {
            api_key: process.env.API_KEY,
          };
          req.session.save();
          res.redirect("/home");
        }
      } else {
        res.redirect("/login");
      }
    })
    .catch(function (err) {
      console.log("Error in logging in,", err);
      res.render("pages/login");
    });
});

app.get("/register", (req, res) => {
  // console.log("/login");
  // res.send('home');
  res.render("pages/register");
});

app.post("/register", async (req, res) => {
  const username = req.body.username;
  const hash = await bcrypt.hash(req.body.password, 10);

  const query = `INSERT INTO users (spotify_username, spotify_password, location) VALUES ('${username}','${hash}','Boulder');`;
  db.any(query)
    .then((data) => {
      res.redirect("/login");
    })
    .catch(function (err) {
      res.redirect("/register");
    })
    .catch(function (err) {
      console.log("Error in logging in,", err);
    });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Necessary callback route for SPotify API authentication
// SHould not be called directly by client
app.get("/callback", async (req, res) => {
  console.log("/callback route");

  code = req.query.code;
  console.log(req.query.code);

  const authUrl = "https://accounts.spotify.com/api/token";

  axios({
    url: authUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // From Spotify documentation
      Authorization:
        "Basic " +
        new Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
    },
    // data must be x-www-urlform-encoded, so it must be turned into a URL search param object
    data: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
    }),
  })
    .then((results) => {
      // Successful case
      console.log(results.data);
      access_token = results.data.access_token;
      refresh_token = results.data.refresh_token;
      res.send(results.data);
    })
    .catch((err) => {
      // Handle errors
      console.log(err);
      res.send("Error. Check console log");
    });
});

// Refresh token route for SPotify API authentication
app.get("/refresh_token", async (req, res) => {
  console.log("/refresh route");

  console.log(refresh_token);

  const refreshUrl = "https://accounts.spotify.com/api/token";

  axios({
    url: refreshUrl,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // From Spotify documentation
      Authorization:
        "Basic " +
        new Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
    },
    // data must be x-www-urlform-encoded, so it must be turned into a URL search param object
    data: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh_token,
    }),
  })
    .then((results) => {
      // Successful case
      console.log(results.data);
      access_token = results.data.access_token;
      refresh_token = results.data.refresh_token;
      res.send(results.data);
    })
    .catch((err) => {
      // Handle errors
      console.log(err);
      res.send("Error. Check console log");
    });
});

// Route to log in to SPotify
// Will likely be modified to fit into our own login endpoint

app.get("/login2", (req, res) => {
  console.log("/login route");

  // should be a random number. For our purposes, this should be fine
  var state = "superrandomnumber";
  var scope = "user-read-private user-read-email";

  params = {
    response_type: "code",
    client_id: CLIENT_ID,
    scope: scope,
    redirect_uri: REDIRECT_URI,
    state: state,
  };

  // redirecting to spotify authorize endpoint to get a verification code
  console.log(
    "https://accounts.spotify.com/authorize?" +
      new URLSearchParams(params).toString()
  );
  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      new URLSearchParams(params).toString()
  );
});

// Route to get current user's data. Verifies authentication works
app.get("/me", (req, res) => {
  console.log("/me route");

  const meUrl = "https://api.spotify.com/v1/me";

  axios({
    url: meUrl,
    method: "GET",
    headers: {
      Authorization: "Bearer " + access_token,
    },
  })
    .then((results) => {
      // Successful case
      console.log(results.data);
      res.send(results.data);
    })
    .catch((err) => {
      // Handle errors
      console.log(err);
      res.send("Error. Check console log");
    });
});

// Route to search for items in Spotify (search for songs, playlists, etc)
// Expects a string searchQuery for the string to serach and type, a list of types of results
app.get("/search", async (req, res) => {
  console.log("/search route");
  const q = req.query.q;
  const type = req.query.type;

  const searchUrl =
    "https://api.spotify.com/v1/search?q=" + q + "&type=" + type;
  console.log("Search URL: ", searchUrl);

  await axios({
    url: searchUrl,
    method: "GET",
    headers: {
      // 'Content-Type': 'application/json',
      Authorization: "Bearer " + access_token,
    },
  })
    .then((results) => {
      // Successful case
      console.log(results.data);

      res.send(results.data.artists.items[0]);
    })
    .catch((err) => {
      // Handle errors
      console.log(err);
      res.send("Error. Check console log");
    });
});

// 9
// Authentication Middleware.
const auth = (req, res, next) => {
  console.log(req.session);
  if (!req.session.user) {
    // Default to register page.
    return res.render("pages/register");
  }
  next();
};

// Authentication Required
app.use(auth);

app.listen(3000);
console.log("Server is listening on port 3000");
