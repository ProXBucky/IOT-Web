const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Sử dụng session
app.use(session({
    secret: 'secretKey123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
}));

// Middleware to log API calls
app.use((req, res, next) => {
    console.log(`Admin Log: ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
    next();
});

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'smartdoor',
    password: '123456',
    port: 5432,
});

// const pool = new Pool({
//     connectionString: 'postgresql://proxbucky:UXxvsLzyjiKokiAKPv4dn7vCCvXE955Y@dpg-ctn13rbv2p9s73ffq2lg-a.singapore-postgres.render.com/smartdoor',
// });

// postgresql://proxbucky:UXxvsLzyjiKokiAKPv4dn7vCCvXE955Y@dpg-ctn13rbv2p9s73ffq2lg-a/smartdoor

// Middleware kiểm tra đăng nhập
const requireLogin = (req, res, next) => {
    // if (!req.session.userId) {
    //     return res.status(401).json({ message: 'Bạn cần đăng nhập để truy cập' });
    // }
    next();
};

// Đăng ký
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Tên người dùng đã tồn tại' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO admins (username, password) VALUES ($1, $2) RETURNING *',
            [username, hashedPassword]
        );

        res.json({ message: 'Đăng ký thành công', user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi khi đăng ký' });
    }
});

// Đăng nhập
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ message: 'Tên đăng nhập không tồn tại' });
        }
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Mật khẩu không đúng' });
        }
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({ message: 'Đăng nhập thành công', user: { id: user.id, name: user.username } });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi khi đăng nhập' });
    }
});

// Đăng xuất
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Không thể đăng xuất' });
        }
        res.clearCookie('connect.sid'); // Xóa cookie session nếu sử dụng cookie
        res.status(200).json({ message: 'Đăng xuất thành công' });
    });
});

// Lấy danh sách người dùng
app.get('/users', requireLogin, async (req, res) => {
    const users = await pool.query('SELECT * FROM users WHERE id != $1', [9]);
    res.json(users.rows);
});

app.post('/users', requireLogin, async (req, res) => {
    const { name, pin_code, rfid_code } = req.body;

    // Kiểm tra mã PIN chỉ có 4 chữ số
    if (pin_code && (!/^\d{4}$/.test(pin_code))) {
        return res.status(400).json({ error: 'Mã PIN phải có đúng 4 chữ số' });
    }

    try {
        // Kiểm tra xem có mã PIN hoặc mã RFID không trùng lặp
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE pin_code = $1 OR rfid_code = $2',
            [pin_code || null, rfid_code || null]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Mã PIN hoặc mã RFID đã tồn tại' });
        }

        const result = await pool.query(
            'INSERT INTO users (name, pin_code, rfid_code) VALUES ($1, $2, $3) RETURNING *',
            [name, pin_code || null, rfid_code || null]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(400).json({ error: 'Đã xảy ra lỗi khi tạo người dùng' });
    }
});

// Mở cửa
app.post('/open-door', requireLogin, async (req, res) => {
    const { pin_code, rfid_code } = req.body;
    const userQuery = pin_code
        ? 'SELECT * FROM users WHERE pin_code = $1'
        : 'SELECT * FROM users WHERE rfid_code = $1';
    const code = pin_code || rfid_code;
    const user = await pool.query(userQuery, [code]);

    if (user.rows.length > 0) {
        await pool.query(
            'INSERT INTO access_logs (user_id, access_type) VALUES ($1, $2)',
            [user.rows[0].id, pin_code ? 'PIN' : 'RFID']
        );
        res.json({ message: 'Cửa đã mở', success: true }); // Phản hồi thành công
    } else {
        res.status(401).json({ message: 'Mã PIN hoặc mã RFID không hợp lệ' }); // Phản hồi không thành công
    }
});

// Lịch sử mở cửa
app.get('/access-logs', requireLogin, async (req, res) => {
    try {
        const logs = await pool.query(`
            SELECT 
                users.name, 
                TO_CHAR(access_logs.access_time, 'HH24:MI:SS DD/MM/YYYY') AS access_time, 
                access_logs.access_type 
            FROM 
                access_logs 
            JOIN 
                users ON access_logs.user_id = users.id
            ORDER BY 
                access_logs.access_time DESC
        `);
        res.json(logs.rows);
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy lịch sử mở cửa' });
    }
});

// Xóa người dùng và lịch sử mở cửa của họ
app.delete('/users/:id', requireLogin, async (req, res) => {
    const userId = req.params.id;
    try {
        // Xóa lịch sử mở cửa của người dùng
        await pool.query('DELETE FROM access_logs WHERE user_id = $1', [userId]);

        // Xóa người dùng
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);

        res.json({ message: 'Người dùng và lịch sử mở cửa đã được xóa thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Đã xảy ra lỗi khi xóa người dùng' });
    }
});

app.post('/open-door-manually', requireLogin, async (req, res) => {
    try {
        const response = await fetch('http://192.168.90.44:80/open-door', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
            console.log('ESP32 responded successfully');

            const userId = req.session.userId;
            const userQuery = 'SELECT * FROM admins WHERE id = $1';
            const user = await pool.query(userQuery, [userId]);

            if (user.rows.length > 0) {
                await pool.query(
                    'INSERT INTO access_logs (user_id, access_type) VALUES ($1, $2)',
                    [userId, 'Admin']
                );
                return res.json({ message: 'Cửa đã mở', success: true });
            } else {
                return res.status(401).json({ message: 'Người dùng không hợp lệ' });
            }
        } else {
            return res.status(500).json({ success: false, message: 'Không thể mở cửa' });
        }
    } catch (error) {
        console.error('Lỗi:', error);
        return res.status(500).json({ success: false, message: 'Lỗi kết nối đến ESP32' });
    }
});

// Kiểm tra trạng thái đăng nhập
app.get('/check-login', (req, res) => {
    if (req.session.userId) {
        res.status(200).json({
            loggedIn: true,
            userId: req.session.userId,
            username: req.session.username
        });
    } else {
        res.status(200).json({ loggedIn: false });
    }
});

let sensorData = { temperature: null, humidity: null };

// Endpoint nhận dữ liệu cảm biến từ Arduino
app.post('/sensor-data', (req, res) => {
    const { temperature, humidity } = req.body;
    if (typeof temperature === 'number' && typeof humidity === 'number') {
        sensorData = { temperature, humidity, timestamp: new Date() };
        console.log(`Received data: Temperature = ${temperature}, Humidity = ${humidity}`);

        res.status(200).json({
            success: true,
            message: 'Data received',
            temperature,
            humidity
        });
    } else {
        res.status(400).json({
            success: false,
            message: 'Invalid data format. Please send numeric values for temperature and humidity.'
        });
    }
});

// Endpoint trả về dữ liệu cảm biến cho frontend
app.get('/sensor-data', (req, res) => {
    if (sensorData.temperature !== null && sensorData.humidity !== null) {
        res.json({
            success: true,
            temperature: sensorData.temperature,
            humidity: sensorData.humidity
        });
    } else {
        res.status(404).json({ success: false, message: 'No sensor data available' });
    }
});



app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
