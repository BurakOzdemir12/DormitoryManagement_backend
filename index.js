import express from "express";
import multer from "multer";
import path from "path";
import mysql from "mysql";
import jwt from "jsonwebtoken";
import cors from "cors";
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';


const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use('/images', express.static(join(__dirname, 'images')));


const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "karub287",
  database: "dormitorymanagement",
});

app.use(express.json());
// app.use(cors());
const corsOptions = {
  origin: 'http://localhost:3000', 
  credentials: true,
};
app.use(cors(corsOptions));
app.get("/", (req, res) => {
  res.json("hello this is the backend");
});

let refreshTokens = [];

app.post("/api/refresh", (req, res) => {
  //take the refresh token from the user
  const refreshToken = req.body.token;
  //send error if there is no token or it's invalid
  if (!refreshToken) return res.status(401).json("You are not authenticated");
  if (!refreshTokens.includes(refreshToken)) {
    return res.status(403).json("Refresh Token is not Valid");
  }
  jwt.verify(refreshToken, "myRefreshSecretKey", (err, user) => {
    err && console.log(err);
    refreshTokens = refreshTokens.filter((token) => token != refreshToken);
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    refreshTokens.push(newRefreshToken);

    res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  });
  //if everything is ok, create new access token,refresh token and send to user
});
const generateAccessToken = (user) => {
  return jwt.sign({ id: user.id, isAdmin: user.isAdmin,dormId: user.dormId  }, "mysecretkey", {
    expiresIn: "120m",
  });
};
const generateRefreshToken = (user) => {
  return jwt.sign({ id: user.id, isAdmin: user.isAdmin,dormId: user.dormId  }, "myRefreshSecretKey");
};

{
  /*
app.post("/api/login", (req, res) => {
  const { username, password, } = req.body;

  const user = users.find((u) => {
    return (
      u.username === username && 
      u.password === password 
    );
  });
  if (user) {
    //generate an access token
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    refreshTokens.push(refreshToken);
    res.json({
      username: user.username,
      isAdmin: user.isAdmin,
      fullname: user.fullname,
      accessToken,
      refreshToken,
    });
  } else {
    res.status(400).json("Username or password incorrect!");
  }
});
*/
}

//Login auth with username password (!For Emu Students)
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const q = "SELECT * FROM users WHERE username = ? AND password = ?";
  db.query(q, [username, password], (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length === 0)
      return res.status(400).json("Username or password incorrect!");

    const user = results[0];
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      fullname: `${user.firstName} ${user.lastName}`,
      accessToken,
      refreshToken,
    });
  });
});
//Verify Token
const verify = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, "mysecretkey", (err, user) => {
      if (err) {
        return res.status(403).json("token is not valid!");
      }
      req.user = user;
      next();
    });
  } else {
    res.status(401).json("you are not authenticated");
  }
};
//this is for delete something with permission if you are an Admin
app.delete("/api/users/:userId", verify, (req, res) => {
  if (req.user.id === req.params.userId || req.user.isAdmin) {
    res.status(200).json("User has been deleted");
  } else {
    res.status(403).json("You are not alowed to delete this user!");
  }
});

//logout
app.post("/api/logout", verify, (req, res) => {
  const refreshToken = req.body.token;

  refreshTokens = refreshTokens.filter((token) => token !== refreshToken);
  res.status(200).json("You logged out successfully");
});
// Getting Student values who's logged successfully
app.get("/users/:id", (req, res) => {
  const userId = req.params.id;
  const q = "SELECT * FROM users WHERE id = ?";

  db.query(q, [userId], (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length === 0) return res.status(404).json("User not found");

    res.json(results[0]);
  });
});

//

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./images/"); 
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage })

function handleDatabaseError(res, error) {
  console.error("Veritabanı hatası:", error);
  res.status(500).json({ error: "İşlem sırasında bir hata oluştu." });
}

function executeQueryWithParams(res, q, values) {
  db.query(q, values, (err, data) => {
    if (err) return handleDatabaseError(res, err);
    return res.json(data);
  });
}










app.get("/api/me", verify, (req, res) => {
  const userId = req.user.id;
  const q = "SELECT id,dormId FROM users WHERE id = ?";
  db.query(q, [userId], (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length === 0) return res.status(404).json("User not found");
    res.json(results[0]);
  });
});



//CRUD OPERATIONS =>

//CREATE
app.post("/dormstudents", (req, res) => {
  const q =
    "INSERT INTO dormstudents (`firstName`,`lastName`,`studentNo`,`age`,`mail` , `phoneNumb`,`passaportNo`,`registerStatu`,`faculty`,`gender`,`dormId`) VALUES (?)";
  const values = [
    req.body.firstName, // Changed from req.body.name
    req.body.lastName,
    req.body.studentNo,
    req.body.age,
    req.body.mail,
    req.body.phoneNumb, // Changed from req.body.phoneNo
    req.body.passaportNo, // Changed from req.body.passaportNo
    req.body.registerStatu,
    req.body.faculty,
    req.body.gender,
    req.body.dormId,
  ];

  db.query(q, [values], (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(`student submitted`);
  });
});
//create Rooms
app.post("/rooms", (req, res) => {
  const q =
    "INSERT INTO rooms (`roomNumber`,`roomCapacity`,`roomType`,`roomStatu`,`student`) VALUES (?)";
  const students = JSON.parse(req.body.students);
  const values = [
    req.body.roomNumber, // Changed from req.body.name
    req.body.roomCapacity,
    req.body.roomType,
    req.body.roomStatu,
    JSON.stringify(students),
  ];

  db.query(q, [values], (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(`Room submitted`);
  });
});
//create dormfeatures

app.post("/dormfeature", upload.single("dormImage"), (req, res) => {
  const { dormName, dormAdress, dormContact, dormRoomCapacity, dormStudentCapacity,dormText } = req.body;
  const dormImage = req.file ? req.file.filename : "";

  const q = "INSERT INTO dormfeature (dormName, dormAdress, dormContact, dormRoomCapacity, dormStudentCapacity, dormImage,dormText) VALUES (?, ?, ?, ?, ?, ?,?)";
  const values = [dormName, dormAdress, dormContact, dormRoomCapacity, dormStudentCapacity, dormImage,dormText];

  executeQueryWithParams(res, q, values);
});
//CREATE dormsprice

app.post("/roomprops", upload.single("roomImage"), (req, res) => {
  const dormId = req.body.dormId;
  const roomImage = req.file ? req.file.filename : "";
  const { roomType, roomPrice } = req.body;
  const q = "INSERT INTO roomprops (roomPrice, roomType, roomImage, dormId) VALUES (?, ?, ?, ?)";
  const values = [roomPrice, roomType, roomImage, dormId];

  executeQueryWithParams(res, q, values);
});



// DELETE
app.delete("/dormstudents/:id", (req, res) => {
  const studentId = req.params.id;
  const q = "DELETE FROM students WHERE id = ?";

  db.query(q, [studentId], (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(`student delete successfully`);
  });
});
//delete Rooms
app.delete("/rooms/:id", (req, res) => {
  const roomsId = req.params.id;
  const q = "DELETE FROM rooms WHERE id = ?";

  db.query(q, [roomsId], (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(`Room delete successfully`);
  });
});

//delete dormfeatures
app.delete("/dormfeature/:id", (req, res) => {
  const dormId = req.params.id;
  const q = "DELETE FROM dormfeature WHERE dormId = ?";
  executeQueryWithParams(res, q, [dormId]);
});
// DELETE dormsprice
app.delete("/roomprops/:id", (req, res) => {
  const dormId = req.params.id;
  const q = "DELETE FROM roomprops WHERE id = ?";

  db.query(q, [dormId], (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(`dormsprice delete successfully`);
  });
});

//UPDATE
app.put("/dormstudents/:id", (req, res) => {
  const studentId = req.params.id;

  const q =
    "UPDATE dormstudents SET `firstName`=?,`lastName`=?,`studentNo`=? ,`age`=?,`mail`=? , `phoneNumb`=?,`passaportNo`=?,`registerStatu`=?,`faculty`=?,`gender`=? WHERE id = ?";
  const values = [
    req.body.firstName, // Changed from req.body.name
    req.body.lastName,
    req.body.studentNo,
    req.body.age,
    req.body.mail,
    req.body.phoneNumb, // Changed from req.body.phoneNo
    req.body.passaportNo, // Changed from req.body.passaportNo
    req.body.registerStatu,
    req.body.faculty,
    req.body.gender,
  ];
  db.query(q, [...values, studentId], (err, data) => {
    if (err) {
      return res.json(err + "wrong");
    }
    return res.json(data);
  });
});
//update student dormId
app.put("/dormstudents/:id/dorm", (req, res) => {
  const studentId = req.params.id;
  const q = "UPDATE dormstudents SET dormId = NULL WHERE id = ?";

  db.query(q, [studentId], (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(`student's dormId set to null successfully`);
  });
});
//update Rooms
app.put("/rooms/:id", (req, res) => {
  const roomId = req.params.id;
  const students = req.body.students;
  const q =
    "UPDATE rooms SET `roomNumber`=?,`roomCapacity`=?,`roomType`=?,`roomStatu`=?,`student`=? WHERE id = ?";
  // const students = JSON.parse(req.body.students);
  const values = [
    req.body.roomNumber, // Changed from req.body.name
    req.body.roomCapacity,
    req.body.roomType,
    req.body.roomStatu,
   
    JSON.stringify(students),
 
  ];
  db.query(q, [...values, roomId], (err, data) => {
    if (err) {
      return res.json(err + "wrong");
    }
    return res.json(data);
  });
});
//UPDATE dormfeatures
app.put("/dormfeature/:id", upload.single("dormImage"), (req, res) => {
  const dormId = req.params.id;
  const { dormName, dormAdress, dormContact, dormRoomCapacity, dormStudentCapacity,dormText } = req.body;
  const dormImage = req.file ? req.file.filename : "";

  const q = "UPDATE dormfeature SET dormName = ?, dormAdress = ?, dormContact = ?, dormRoomCapacity = ?, dormStudentCapacity = ?, dormImage = ? , dormText = ? WHERE dormId = ?";
  const values = [dormName, dormAdress, dormContact, dormRoomCapacity, dormStudentCapacity, dormImage,dormText, dormId];

  executeQueryWithParams(res, q, values);
});
//UPDATE roomsprops
app.put("/roomprops/:id",upload.single("roomImage"), (req, res) => {

  const id = req.params.id;
  const { roomPrice, roomType } = req.body;
  const roomImage = req.file ? req.file.filename : "";

  const q =
    "UPDATE roomprops SET roomPrice=?,roomType=?,roomImage=? WHERE id = ?";
  const values = [
    roomPrice, 
    roomType,
    roomImage,
    id
  ];
  executeQueryWithParams(res, q, values);
});

//READ
app.get("/dormstudents", (req, res) => {
  const q = "SELECT * FROM dormstudents";
  db.query(q, (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(data);
  });
});
//READ FOR ONE OBECT( using ild)
app.get("/dormstudents/:id", (req, res) => {
  const studentId = req.params.id;
  const q = `SELECT * FROM dormstudents WHERE id = ${studentId}`;
  db.query(q, (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(data[0]);
  });
});
//READ For Rooms
app.get("/rooms", (req, res) => {
  const q = "SELECT * FROM rooms";
  db.query(q, (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(data);
  });
});
//READ FOR ONE Room OBECT( using id)
app.get("/rooms/:id", (req, res) => {
  const roomId = req.params.id;
  const q = `SELECT * FROM rooms WHERE id = ${roomId}`;
  console.log(roomId)

  db.query(q, (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(data[0]);
    
  });
});
//Read DormFeatures
app.get("/dormfeature", (req, res) => {
  const q = "SELECT * FROM dormfeature";
  db.query(q, (err, data) => {
    if (err) return handleDatabaseError(res, err);
    return res.json(data);
  });
});
//Read ONE  DormFeature
app.get("/dormfeature/:id", (req, res) => {
  const dormId = req.params.id;
  const q = `SELECT * FROM dormfeature WHERE dormId = ?`;

  db.query(q, [dormId], (err, data) => {
    if (err) return handleDatabaseError(res, err);
    if (data.length === 0) {
      return res.status(404).json({ error: "Dorm feature not found" });
    }
    return res.json(data[0]);
  });
});
//READ roomprice
app.get("/roomprops", (req, res) => {
  const q = "SELECT * FROM roomprops";
  db.query(q, (err, data) => {
    if (err) return handleDatabaseError(res, err);
    return res.json(data);
  });
});
app.get("/roomprops/:id", (req, res) => {
  const dormId = req.params.id;
  const q = `SELECT * FROM roomprops WHERE dormId = ?`;

  db.query(q, [dormId], (err, data) => {
    if (err) return handleDatabaseError(res, err);
    if (data.length === 0) {
      return res.status(404).json({ error: "Room feature not found" });
    }
    return res.json(data);
  });
});


app.listen(8800, () => {
  console.log("Connected to backend ");
});
