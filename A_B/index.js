require('dotenv').config(); // โหลดค่าคอนฟิกจาก .env
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const WebSocket = require('ws');

// กำหนด URL ของ WebSocket Server
const wsUrl = 'ws://technest.ddns.net:8001/ws';
const apiKey = '670a935a14221a12ae886117c99cacc7'; // ระบุ API Key ของคุณที่นี่

// สร้างการเชื่อมต่อ WebSocket
const ws = new WebSocket(wsUrl);

// เมื่อเชื่อมต่อสำเร็จ
ws.on('open', () => {
    console.log('Connected to WebSocket API');
    
    // ส่ง API Key ไปยังเซิร์ฟเวอร์
    ws.send(apiKey);
    console.log('API Key sent to server');
});

// เมื่อได้รับข้อความจากเซิร์ฟเวอร์
ws.on('message',async (data) => {
    try {
        // แปลงข้อมูลที่ได้รับเป็น JSON
        const parsedData = JSON.parse(data);
        console.log('Received JSON data from Machine API:', parsedData);
        const query = `
        INSERT INTO measurements (
          energy_consumption_power,
          voltage_l1_gnd,
          voltage_l2_gnd,
          voltage_l3_gnd,
          pressure,
          force,
          cycle_count,
          position_of_the_punch
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

        // รันคำสั่ง SQL ด้วยค่าจาก JSON
        await pool.query(query, [
            parsedData["Energy Consumption"].Power,
            parsedData.Voltage["L1-GND"],
            parsedData.Voltage["L2-GND"],
            parsedData.Voltage["L3-GND"],
            parsedData.Pressure,
            parsedData.Force,
            parsedData["Cycle Count"],
            parsedData["Position of the Punch"]
        ]);
        
        // สามารถนำ `parsedData` ไปใช้งานได้ตามต้องการ เช่น บันทึกข้อมูล หรือวิเคราะห์ข้อมูล
    } catch (error) {
        console.error('Failed to parse data as JSON:', error);
    }
});

// จัดการข้อผิดพลาดต่างๆ
ws.on('error', (err) => {
    console.error('WebSocket Error:', err);
});

// เมื่อการเชื่อมต่อถูกปิด
ws.on('close', () => {
    console.log('WebSocket connection closed');
});


const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// สร้าง Middleware ฟังก์ชันสำหรับตรวจสอบ JWT
const authenticateToken = (req, res, next) => {
    // รับ token จาก Header
    const token = req.header('Authorization')?.split(' ')[1];

    // ถ้าไม่มี token ให้ตอบกลับด้วยสถานะ 401
    if (!token) return res.status(401).json({ message: 'Access denied' });

    // ตรวจสอบความถูกต้องของ token
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        // ถ้า token ไม่ถูกต้อง ให้ตอบกลับด้วยสถานะ 403
        if (err) return res.status(403).json({ message: 'Invalid token' });

        // ถ้า token ถูกต้อง ให้บันทึกข้อมูลผู้ใช้ที่ถูกยืนยันและไปต่อ
        req.user = user;
        next();
    });
};

// ใช้ middleware นี้กับ API ที่ต้องการการยืนยันตัวตน เช่น /protected
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'Access to protected data granted' });
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // แฮชรหัสผ่าน
        const result = await pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
            [username, hashedPassword]
        );

        res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: 'Error registering user' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

        if (user.rows.length === 0 || !(await bcrypt.compare(password, user.rows[0].password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '5m' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ message: 'Error logging in' });
    }
});


app.get('/measurements', async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM measurements ORDER BY id DESC')
        res.json(data.rows)
    } catch (error) {
        console.log("Message error", error)
    }
});
app.get('/measurements/user',authenticateToken, async (req, res) => {
    try {
        const data = await pool.query('SELECT * FROM measurements ORDER BY id DESC')
        res.json(data.rows)
    } catch (error) {
        console.log("Message error", error)
    }
});

app.post('/measurements', async (req, res) => {
    const newData = req.body;

    try {
        // สร้างคำสั่ง SQL สำหรับการบันทึกข้อมูลลงตาราง
        const query = `
        INSERT INTO measurements (
          energy_consumption_power,
          voltage_l1_gnd,
          voltage_l2_gnd,
          voltage_l3_gnd,
          pressure,
          force,
          cycle_count,
          position_of_the_punch
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

        // รันคำสั่ง SQL ด้วยค่าจาก JSON
        await pool.query(query, [
            newData["Energy Consumption"].Power,
            newData.Voltage["L1-GND"],
            newData.Voltage["L2-GND"],
            newData.Voltage["L3-GND"],
            newData.Pressure,
            newData.Force,
            newData["Cycle Count"],
            newData["Position of the Punch"]
        ]);

        res.status(201).send('Data added to database');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error saving data to database');
    }
});
app.post('/measurements/user', authenticateToken, async (req, res) => {
    const data = req.body;

    try {
        // สร้างคำสั่ง SQL สำหรับการบันทึกข้อมูลลงตาราง
        const query = `
        INSERT INTO measurements (
          energy_consumption_power,
          voltage_l1_gnd,
          voltage_l2_gnd,
          voltage_l3_gnd,
          pressure,
          force,
          cycle_count,
          position_of_the_punch
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

        // รันคำสั่ง SQL ด้วยค่าจาก JSON
        await pool.query(query, [
            data["Energy Consumption"].Power,
            data.Voltage["L1-GND"],
            data.Voltage["L2-GND"],
            data.Voltage["L3-GND"],
            data.Pressure,
            data.Force,
            data["Cycle Count"],
            data["Position of the Punch"]
        ]);

        res.status(201).send('Data added to database');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error saving data to database');
    }
});

app.put('/measurements/user', authenticateToken, async (req, res) => {
    const data = req.body;

    try {
        // สร้างคำสั่ง SQL สำหรับการบันทึกข้อมูลลงตาราง
        const query = `
        UPDATE measurements
        SET id=$1, energy_consumption_power=$2, voltage_l1_gnd=$3, voltage_l2_gnd=$4, voltage_l3_gnd=$5, pressure=$6, force=$7, cycle_count=$8, position_of_the_punch=$9
        WHERE id = $1;
      `;

        // รันคำสั่ง SQL ด้วยค่าจาก JSON
        await pool.query(query, [data.id,
            data["Energy Consumption"].Power,
            data.Voltage["L1-GND"],
            data.Voltage["L2-GND"],
            data.Voltage["L3-GND"],
            data.Pressure,
            data.Force,
            data["Cycle Count"],
            data["Position of the Punch"]
        ]);

        res.status(201).send('Data update to database');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error saving data to database');
    }
});

app.delete('/measurements/user', authenticateToken, async (req, res) => {
    const data = req.body;

    try {
        // สร้างคำสั่ง SQL สำหรับการบันทึกข้อมูลลงตาราง
        const query = `
        DELETE FROM measurements
	    WHERE id = $1;
      `;

        // รันคำสั่ง SQL ด้วยค่าจาก JSON
        await pool.query(query, [data.id]);

        res.status(201).send('Data delete to database');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error saving data to database');
    }
});


const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});