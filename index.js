import express from "express";
import multer from "multer";
import mysql from "mysql";
import jwt from "jsonwebtoken";
import cors from "cors";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Server } from "socket.io";
import http from "http";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});
app.use("/images", express.static(join(__dirname, "images")));

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "karub287",
  database: "dormitorymanagement",
});

app.use(express.json());
// app.use(cors());
const corsOptions = {
  origin: "http://localhost:3000",
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
  return jwt.sign(
    { id: user.id, isAdmin: user.isAdmin, dormId: user.dormId },
    "mysecretkey",
    {
      expiresIn: "120m",
    }
  );
};
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id, isAdmin: user.isAdmin, dormId: user.dormId },
    "myRefreshSecretKey"
  );
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
//Sign up
// Signup route
app.post("/users", async (req, res) => {
  const { username, password, firstName, lastName, passaportNo } = req.body;

  const checkUserQuery = "SELECT * FROM users WHERE username = ?";
  db.query(checkUserQuery, [username], (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database query error" });
    }
    if (results.length > 0) {
      return res.status(400).json("Username already exists!");
    }

    bcrypt.hash(password, 5, (err, hashedPassword) => {
      if (err) {
        console.error("Error hashing password:", err);
        return res.status(500).json({ error: "Error hashing password" });
      }

      const verificationCode = generateVerificationCode();
      const verificationToken = crypto.randomBytes(32).toString("hex");

      const insertUserQuery =
        "INSERT INTO users (username, password, firstName, lastName, passaportNo, isVerified, verification,verificationToken) VALUES (?, ?, ?, ?, ?, false, ?,?)";
      db.query(
        insertUserQuery,
        [
          username,
          hashedPassword,
          firstName,
          lastName,
          passaportNo,
          verificationCode,
          verificationToken,
        ],
        async (err, result) => {
          if (err) {
            console.error("Database insert error:", err);
            return res.status(500).json({ error: "Database insert error" });
          }

          const userId = result.insertId;

          const transporter = nodemailer.createTransport({
            service: "gmail",
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: {
              user: process.env.USER,
              pass: process.env.APP_PASSWORD,
            },
          });
          const verificationLink = `http://localhost:3000/verify-email?token=${verificationToken}`;

          const mailOptions = {
            from: {
              name: "EMU Admin",
              address: process.env.USER,
            },
            to: username,
            subject: "Doğrulama Kodu ✔",
            text: `Merhaba ${firstName},\n\nDoğrulama kodunuz: ${verificationCode}\n\nDoğrulamak için bu linke tıklayınız: ${verificationLink}\n\nEMU Yönetimi`,
            html: `<p>Merhaba ${firstName},</p><p>Doğrulama kodunuz: <strong>${verificationCode}</strong></p><p>Doğrulamak için <a href="${verificationLink}">bu linke</a> tıklayınız.</p><p>EMU Yönetimi</p>`,
          };

          try {
            await transporter.sendMail(mailOptions);
            res.json({ message: "User registered successfully", userId });
          } catch (error) {
            console.error("Error sending email:", error);
            res.status(500).json({ error: "Error sending email" });
          }
        }
      );
    });
  });
});

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
app.get("/verify-email", (req, res) => {
  const { token } = req.query;

  console.log("Received token:", token); // Token'ı kontrol edin

  const checkTokenQuery = "SELECT * FROM users WHERE verificationToken = ?";
  db.query(checkTokenQuery, [token], (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database query error" });
    }
    if (results.length === 0) {
      return res.status(400).json("Invalid verification token");
    }

    console.log("User found:", results[0]); // Kullanıcıyı kontrol edin

    const updateUserQuery =
      "UPDATE users SET isVerified = true WHERE verificationToken = ?";
    db.query(updateUserQuery, [token], (err, results) => {
      if (err) {
        console.error("Database update error:", err);
        return res.status(500).json({ error: "Database update error" });
      }

      console.log("User updated"); // Güncellemenin başarılı olduğunu kontrol edin
      res.send("Email doğrulama başarılı, şimdi giriş yapabilirsiniz.");
    });
  });
});

// verification
app.post("/verify", (req, res) => {
  const { username, verificationCode } = req.body;
  console.log("Doğrulama isteği alındı:", req.body);
  const q = "SELECT * FROM users WHERE username = ? AND verification = ?";
  db.query(q, [username, verificationCode], (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database query error" });
    }

    if (results.length === 0) {
      return res.status(400).json("Invalid verification code");
    }

    const updateUserQuery =
      "UPDATE users SET isVerified = true WHERE username = ?";
    db.query(updateUserQuery, [username], (err, results) => {
      if (err) {
        console.error("Database update error:", err);
        return res.status(500).json({ error: "Database update error" });
      }

      res.json("User verified successfully");
    });
  });
});

//Login auth with username password (!For Emu Students)
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const q = "SELECT * FROM users WHERE username = ?";
  db.query(q, [username], (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length === 0)
      return res.status(400).json("Username or password incorrect!");

    const user = results[0];

    if (!user.isVerified) {
      return res.status(400).json("Please verify your email!");
    }

    const hashedPassword = user.password; 

    bcrypt.compare(password, hashedPassword, (err, result) => {
      if (err) return res.status(500).json(err);
      if (!result)
        return res.status(400).json("Username or password incorrect!");

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
const upload = multer({ storage: storage });


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
const executeQueryWithParamsJson = (res, q, values) => {
  db.query(q, values, (err, data) => {
    if (err) return handleDatabaseError(res, err);
    return res.json(data);
  });
};
app.get("/api/me", verify, (req, res) => {
  const userId = req.user.id;

  const q = `
  SELECT  users.id AS userId, users.firstName,  users.lastName, users.isAdmin, dormfeature.dormId
  FROM   users LEFT OUTER JOIN   dormfeature ON users.dormID = dormfeature.dormId
  LEFT OUTER JOIN   rooms ON users.dormID = rooms.dormId
  WHERE   users.id = ?

  `;

  db.query(q, [userId], (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length === 0) return res.status(404).json("User not found");

    // Kullanıcı bilgilerini döndürüyoruz
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
    "INSERT INTO rooms (`roomNumber`,`roomCapacity`,`roomType`,`roomStatu`,`student`,`dormId`) VALUES (?)";
  const students = JSON.parse(req.body.students);
  const values = [
    req.body.roomNumber, // Changed from req.body.name
    req.body.roomCapacity,
    req.body.roomType,
    req.body.roomStatu,
    JSON.stringify(students),
    req.body.dormId,
  ];

  db.query(q, [values], (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(`Room submitted`);
  });
});

app.post("/dormfeature", upload.single("dormImage"), (req, res) => {
  const {
    dormName,
    dormAdress,
    dormContact,
    dormRoomCapacity,
    dormStudentCapacity,
    dormText,
  } = req.body;
  const dormImage = req.file ? req.file.filename : "";

const q =
    "INSERT INTO dormfeature (dormName, dormAdress, dormContact, dormRoomCapacity, dormStudentCapacity, dormImage, dormText) VALUES (?, ?, ?, ?, ?, ?, ?)";
  const values = [
    dormName,
    dormAdress,
    dormContact,
    dormRoomCapacity,
    dormStudentCapacity,
    dormImage,
    dormText,
  ];

  db.query(q, values, (err, result) => {
    if (err) return res.status(500).json(err);
    res.status(200).json({ insertId: result.insertId });
  });
});
//CREATE dormsprice

app.post("/roomprops", upload.array("roomImage", 5), (req, res) => {
  try {
    const { roomPrice, roomType, dormId } = req.body;
    const roomImages = req.files ? req.files.map((file) => file.filename) : [];

    const q = `
      INSERT INTO roomprops (roomPrice, roomType, roomImage, dormId)
      VALUES (?, ?, ?, ?)`;
    const values = [roomPrice, roomType, JSON.stringify(roomImages), dormId];

    executeQueryWithParamsJson(res, q, values);
  } catch (error) {
    res.status(500).send({ error: "Hata oluştu" });
  }
});
//CREATE reservation post
app.post("/reservations", (req, res) => {
  const q =
    "INSERT INTO reservations (`studentNo`,`phoneNumb`,`firstName`,`lastName`,`gender`,`dormId`,`roomId`) VALUES (?)";
  const values = [
    req.body.studentNo, // Changed from req.body.name
    req.body.phoneNumb,
    req.body.firstName,
    req.body.lastName,
    req.body.gender,
    req.body.dormId,
    req.body.roomId,
  ];

  db.query(q, [values], (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(`res submitted`);
  });
});
//Create dormmanager

app.post("/dormadminadd", (req, res) => {
  const { username, password, firstName, lastName, dormId } = req.body;
  const isAdmin = 1;
  const isVerified = 1;
  const   passaportNo=0;
  const q = `
    INSERT INTO users (username, password, firstName, lastName,  passaportNo,isVerified,isAdmin, dormId)
    VALUES (?, ?, ?, ?, ?, ?,?,?)
  `;
  const values = [username, password, firstName, lastName,passaportNo, isAdmin, dormId,isVerified];

  db.query(q, values, (err, result) => {
    if (err) return res.status(500).json(err);
    res.status(200).json({ userId: result.insertId });
  });
}); 
// DELETE
app.delete("/dormstudents/:id", (req, res) => {
  const studentId = req.params.id;
  const q = "DELETE FROM dormstudents WHERE id = ?";

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
app.delete("/deleteres/:id", (req, res) => {
  const id = req.params.id;
  const updateUserQuery = "DELETE FROM reservations WHERE id = ?";
  db.query(updateUserQuery, [id], (err, results) => {
    if (err) {
      console.error("Database update error:", err);
      return res.status(500).json({ error: "Database update error" });
    }
    res.json("Reservation verified successfully");
  });
});

//UPDATE Verify Reservation
app.put("/verifyres/:id", (req, res) => {
  const id = req.params.id;
  const updateUserQuery = "UPDATE reservations SET isVerified = true WHERE id = ?";
  db.query(updateUserQuery, [id], (err, results) => {
    if (err) {
      console.error("Database update error:", err);
      return res.status(500).json({ error: "Database update error" });
    }
    res.json("Reservation verified successfully");
  });
});
//UPDATE DORMSTUDENTS
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
//update room with reservations card


app.put("/rooms/assign/:id", (req, res) => {
  const roomId = req.params.id;
  const studentData = req.body.student;

  // Veritabanındaki mevcut öğrenci bilgilerini al
  const qSelect = "SELECT `student` FROM rooms WHERE id = ?";
  db.query(qSelect, [roomId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Mevcut öğrenci bilgilerini JSON formatında çöz
    let existingStudents = [];
    if (result[0] && result[0].student) {
      try {
        existingStudents = JSON.parse(result[0].student);
      } catch (parseErr) {
        return res.status(500).json({ error: "Öğrenci verileri çözümlenemedi." });
      }
    }

    // Yeni öğrenci bilgisini mevcut öğrenci bilgilerine ekle
    if (!existingStudents.includes(studentData)) {
      existingStudents.push(studentData);
    }

    const updatedStudents = JSON.stringify(existingStudents);

    // Öğrenci bilgilerini güncelle
    const qUpdate = "UPDATE rooms SET `student`=? WHERE id = ?";
    db.query(qUpdate, [updatedStudents, roomId], (err, data) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      return res.status(200).json({ message: "Öğrenci odaya başarıyla atandı!" });
    });
  });
});

//UPDATE dormfeatures
  

app.put("/dormfeature/:id", upload.single("dormImage"), (req, res) => {
  const dormId = req.params.id;
  const {
    dormName,
    dormAdress,
    dormContact,
    dormRoomCapacity,
    dormStudentCapacity,
    dormText,
  } = req.body;
  const dormImage = req.file ? req.file.filename : "";

  
  const q =
    "UPDATE dormfeature SET dormName = ?, dormAdress = ?, dormContact = ?, dormRoomCapacity = ?, dormStudentCapacity = ?, dormImage = ? , dormText = ? WHERE dormId = ?";
  const values = [
    dormName,
    dormAdress,
    dormContact,
    dormRoomCapacity,
    dormStudentCapacity,
    dormImage,
    dormText,
    dormId,
  ];

  executeQueryWithParams(res, q, values);
});
//UPDATE roomsprops

app.put("/roomprops/:id", upload.array("roomImage", 5), (req, res) => {
  const id = req.params.id;
  const { roomPrice, roomType, dormId } = req.body; // dormId'yi body'den al
  const roomImages = req.files ? req.files.map((file) => file.filename) : [];

  const q =
    "UPDATE roomprops SET roomPrice=?, roomType=?, roomImage=?, dormId=? WHERE id=?";
  const values = [roomPrice, roomType, JSON.stringify(roomImages), dormId, id];

  executeQueryWithParamsJson(res, q, values);
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
  console.log(roomId);

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
    if (err) return res.json(err);

    // Veritabanından gelen her bir kaydın roomImage alanını parse ediyoruz
    const parsedData = data.map((feature) => ({
      ...feature,
      roomImage: JSON.parse(feature.roomImage || "[]"),
    }));

    return res.json(parsedData);
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
    
    // Veritabanından gelen her bir kaydın roomImage alanını parse ediyoruz
    const parsedData = data.map((feature) => ({
      ...feature,
      roomImage: JSON.parse(feature.roomImage || "[]"),
    }));
    
    return res.json(parsedData);
  });
});
// app.get("/students", (req, res) => {
//   const q = "SELECT mail FROM students";
//   db.query(q, (err, data) => {
//     if (err) return handleDatabaseError(res, err);
//     const studentEmails = data.map(student => student.mail);
//     res.json(studentEmails);
//   });
// });

// app.get("/students", (req, res) => {
//   const query = "SELECT mail, passaportNo FROM students";
//   db.query(query, (err, data) => {
//     if (err) {
//       console.error("Error fetching student data: " + err.stack);
//       res.status(500).json({ error: "Internal server error" });
//       return;
//     }

//     const studentInfo = data.map((student) => ({
//       email: student.mail,
//       passaportNo: student.passaportNo,
//     }));
//     res.json(studentInfo);
//   });
// });
app.get("/students", (req, res) => {
  const query = "SELECT * FROM students";
  db.query(query, (err, data) => {
    if (err) {
      console.error("Error fetching student data: " + err.stack);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    const studentInfo = data.map((student) => ({
      firstName: student.firstName,
      lastName: student.lastName,
      studentNo: student.studentNo,
      age: student.age,
      email: student.mail,
      phoneNumb: student.phoneNumb,
      passaportNo: student.passaportNo,
      registerStatu: student.registerStatu,
      faculty: student.faculty,
      gender: student.gender,
    }));
    res.json(studentInfo);
  });
});
app.get("/reservations", (req, res) => {
  const q = "SELECT * FROM reservations";
  db.query(q, (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(data);
  });
});
//READ FOR ONE OBECT( using ild)
app.get("/reservations/:id", (req, res) => {
  const reservationId = req.params.id;
  const q = `SELECT * FROM reservations WHERE id = ${reservationId}`;
  db.query(q, (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(data[0]);
  });
});
app.get("/dormadminadd", (req, res) => {
  const q = "SELECT * FROM users";
  db.query(q, (err, data) => {
    if (err) {
      return res.json(err);
    }
    return res.json(data);
  });
});

io.on("connection", (socket) => {
  console.log("Yeni bir kullanıcı bağlandı");

  socket.on("joinRoom", ({ dormId, roomId, roomNumber }) => {
    const roomName = `${dormId}-${roomId}-${roomNumber}`;
    socket.join(roomName);
    console.log(`Kullanıcı odaya katıldı: ${roomName}`);
  });

  socket.on("disconnect", () => {
    console.log("Bir kullanıcı ayrıldı");
  });

  socket.on("message", (msg) => {
    console.log("Yeni mesaj:", msg);
    const roomName = `${msg.dormId}-${msg.roomId}-${msg.roomNumber}`;
    io.to(roomName).emit("message", msg);

    // Mesajı veritabanına kaydet
    const query =
      "INSERT INTO messages (dormId, roomId, studentName, roomNumber, timestamp, text) VALUES (?, ?, ?, ?, ?, ?)";
    const values = [
      msg.dormId,
      msg.roomId,
      msg.studentName,
      msg.roomNumber,
      msg.timestamp,
      msg.text,
    ];
    db.query(query, values, (err, result) => {
      if (err) {
        console.error("Error saving message to database:", err);
      } else {
        console.log("Message saved to database:", result);
      }
    });
  });
});
const PORT = 8000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

app.listen(8800, () => {
  console.log("Connected to backend ");
});


