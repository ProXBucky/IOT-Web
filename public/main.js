// window.onload = checkLogin;
let toggleCount = 0;
const container = document.querySelector('.container');
container.classList.add('first');
document.querySelector('.toggle-panels-btn').addEventListener('click', function () {
    const container = document.querySelector('.container');
    if (toggleCount % 2 !== 0) {
        container.classList.remove('second')
        container.classList.add('first');
    } else {
        container.classList.remove('first')
        container.classList.add('second');
    }

    toggleCount++;
});

async function fetchUsers() {
    const response = await fetch('/users');
    const users = await response.json();
    const usersList = document.getElementById('users');
    usersList.innerHTML = '';
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `  
            <td>${user.name}</td>
            <td>${user.pin_code || 'N/A'}</td>
            <td>${user.rfid_code || 'N/A'}</td>
            <td><button onclick="deleteUser(${user.id})">Xóa</button></td>
        `;
        usersList.appendChild(row);
    });
}

async function deleteUser(userId) {
    if (confirm('Bạn có chắc chắn muốn xóa người dùng này và lịch sử mở cửa của họ không?')) {
        const response = await fetch(`/users/${userId}`, { method: 'DELETE' });
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            fetchUsers(); // Cập nhật lại danh sách người dùng sau khi xóa
        } else {
            alert(data.error);
        }
    }
}

async function fetchLogs() {
    const response = await fetch('/access-logs');
    const logs = await response.json();
    const logsList = document.getElementById('logs');
    logsList.innerHTML = '';
    logs.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = ` 
            <td>${log.name}</td>
            <td>${log.access_time}</td>
            <td>${log.access_type}</td>
        `;
        logsList.appendChild(row);
    });
}

document.getElementById('createUserBtn').addEventListener('click', async () => {
    const name = document.getElementById('name').value;
    const pin_code = document.getElementById('pin_code').value || null;
    const rfid_code = document.getElementById('rfid_code').value || null;

    if (name && (pin_code || rfid_code)) {
        const response = await fetch('/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, pin_code, rfid_code })
        });
        const data = await response.json();
        if (response.ok) {
            displayCreateUserMessage(`Người dùng ${data.name} đã được tạo thành công!`);
            fetchUsers();
        } else {
            displayCreateUserMessage(data.error, 'error');
        }
    } else {
        displayCreateUserMessage('Vui lòng điền tên người dùng và ít nhất một mã PIN hoặc mã RFID!', 'error');
    }
});

document.getElementById('fetchLogsBtn').addEventListener('click', fetchLogs);

function displayCreateUserMessage(message, type = 'success') {
    const messageDiv = document.getElementById('createUserResponse');
    messageDiv.textContent = message;
    messageDiv.className = type === 'error' ? 'error' : 'success';
    setTimeout(() => messageDiv.textContent = '', 3000);
}

document.getElementById('openDoorBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/open-door-manually', {
            method: 'POST',
        });

        const data = await response.json();

        if (data.success) {
            alert('Cửa đã được mở!');
        } else {
            alert('Đã xảy ra lỗi khi mở cửa.');
        }
    } catch (error) {
        console.error('Lỗi kết nối:', error);
        alert('Không thể kết nối đến máy chủ.');
    }
});


const authSection = document.getElementById('auth-section');
const registerSection = document.getElementById('register-section');
const system = document.querySelector('.system');

function showLogin() {
    authSection.style.display = 'block';
    registerSection.style.display = 'none';
    system.style.display = 'none';
}

function showRegister() {
    registerSection.style.display = 'block';
    authSection.style.display = 'none';
}

function showSystem() {
    authSection.style.display = 'none';
    registerSection.style.display = 'none';
    system.style.display = 'flex';
}

// async function checkLogin() {
//     try {
//         const response = await fetch('/check-login', {
//             method: 'GET',
//             credentials: 'include', // Cookie/session sẽ được sử dụng
//         });
//         const data = await response.json();  // Giả sử API trả về thông tin người dùng

//         if (data.loggedIn) {
//             document.getElementById('welcome-message').textContent = `Xin chào, ${data.username}`;
//             document.querySelector('.system').style.display = 'flex';
//             // fetchUsers();
//             // fetchLogs();
//         } else {
//             showLogin(); // Hiển thị giao diện đăng nhập nếu chưa đăng nhập
//         }
//     } catch (error) {
//         console.error('Lỗi khi kiểm tra trạng thái đăng nhập:', error);
//         showLogin();
//     }
// }

document.getElementById('logoutBtn').addEventListener('click', async () => {
    const response = await fetch('/logout', { method: 'POST' });
    if (response.ok) {
        showLogin();
    } else {
        alert('Đã xảy ra lỗi khi đăng xuất');
    }
});

// Cập nhật giao diện đăng nhập, đăng ký và hệ thống
function showLogin() {
    document.querySelector('.system').style.display = 'none';
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('register-section').style.display = 'none';
}

function showRegister() {
    document.querySelector('.system').style.display = 'none';
    document.getElementById('register-section').style.display = 'block';
    document.getElementById('auth-section').style.display = 'none';
}

function showSystem() {
    document.querySelector('.system').style.display = 'flex';
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'none';
}

// Chuyển đổi giữa Login và Register
document.getElementById('goToRegister').addEventListener('click', showRegister);
document.getElementById('goToLogin').addEventListener('click', showLogin);

// Xử lý form Đăng Nhập
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
        showSystem();
        fetchUsers();
        fetchLogs();
    } else {
        alert('Đăng nhập thất bại! Vui lòng thử lại.');
    }
});

// Xử lý form Đăng Ký
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;

    const response = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
        alert('Đăng ký thành công! Vui lòng đăng nhập.');
        showLogin();
    } else {
        alert('Đăng ký thất bại! Vui lòng thử lại.');
    }
});

// Hàm lấy dữ liệu cảm biến từ server và hiển thị
function fetchSensorData() {
    fetch('/sensor-data')
        .then((response) => response.json())
        .then((data) => {
            if (data.success) {
                // Hiển thị dữ liệu cảm biến lên giao diện
                document.getElementById('temperature').textContent = `Temperature: ${data.temperature} °C`;
                document.getElementById('humidity').textContent = `Humidity: ${data.humidity} %`;
            } else {
                console.log('No data available or error occurred.');
            }
        })
        .catch((error) => console.error('Error fetching sensor data:', error));
}

setInterval(fetchSensorData, 7000);


// Gọi lần đầu tiên khi trang được tải
fetchSensorData();
// Kiểm tra trạng thái đăng nhập khi tải trang
// checkLogin();
// Khởi động fetch users và logs khi load trang
fetchUsers();
fetchLogs();