const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

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

// Lấy danh sách người dùng
app.get('/users', async (req, res) => {
    const users = await pool.query('SELECT * FROM users WHERE id != $1', [9]);
    res.json(users.rows);
});

app.post('/users', async (req, res) => {
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
app.post('/open-door', async (req, res) => {
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
app.get('/access-logs', async (req, res) => {
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
app.delete('/users/:id', async (req, res) => {
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

app.post('/open-door-manually', async (req, res) => {
    try {
        console.log('Sending request to ESP32 to open the door...');
        const response = await fetch('http://192.168.0.115:80/open-door', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
            console.log('ESP32 responded successfully');
            const userQuery = 'SELECT * FROM users WHERE rfid_code = $1'
            const code = 'ToiLaAdminNhe';
            const user = await pool.query(userQuery, [code]);

            if (user.rows.length > 0) {
                await pool.query(
                    'INSERT INTO access_logs (user_id, access_type) VALUES ($1, $2)',
                    [user.rows[0].id, 'Admin']
                );
                return res.json({ message: 'Cửa đã mở', success: true }); // Phản hồi thành công
            } else {
                return res.status(401).json({ message: 'Mã PIN hoặc mã RFID không hợp lệ' }); // Phản hồi không thành công
            }
        } else {
            console.log('Failed to open door. Response not OK.');
            return res.status(500).json({ success: false, message: 'Không thể mở cửa' });
        }
    } catch (error) {
        console.error('Lỗi:', error);
        return res.status(500).json({ success: false, message: 'Lỗi kết nối đến ESP32' });
    }
});



app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
