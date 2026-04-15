const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Quản lý dữ liệu phòng
let rooms = {};

io.on('connection', (socket) => {
    console.log('Một kết nối mới:', socket.id);

    // 1. Host tạo phòng
    socket.on('createRoom', (data) => {
        const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
        rooms[roomCode] = {
            hostId: socket.id,
            players: {},
            duration: data.duration,
            status: 'waiting'
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, duration: data.duration });
    });

    // 2. Người chơi tham gia phòng
    // Người chơi tham gia phòng
    socket.on('joinRoom', (data) => {
        const { roomCode, playerName } = data;
        const room = rooms[roomCode];

        if (room) {
            // 1. KIỂM TRA TRÙNG TÊN (Không phân biệt hoa thường và bỏ khoảng trắng thừa)
            const isNameTaken = Object.values(room.players).some(
                p => p.name.trim().toLowerCase() === playerName.trim().toLowerCase()
            );

            if (isNameTaken) {
                // Gửi lỗi về nếu tên đã tồn tại trong phòng này
                socket.emit('errorMsg', 'Tên này đã có người sử dụng trong phòng! Vui lòng chọn tên khác.');
                return; // Dừng xử lý, không cho vào phòng
            }

            // 2. Nếu tên hợp lệ, tiến hành cho vào phòng
            socket.join(roomCode);
            room.players[socket.id] = {
                name: playerName.trim(),
                score: 0
            };

            socket.emit('joinSuccess', { 
                roomCode, 
                status: room.status 
            });

            io.to(roomCode).emit('updatePlayerList', Object.values(room.players));
            
            if(room.status === 'playing') {
                const leaderboard = Object.values(room.players).sort((a, b) => b.score - a.score);
                socket.emit('updateLeaderboard', leaderboard);
            }
        } else {
            socket.emit('errorMsg', 'Phòng không tồn tại!');
        }
    });
    // 3. Host bắt đầu game
    socket.on('startGame', (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].status = 'playing';
            io.to(roomCode).emit('gameStarted');
        }
    });

    // 4. Cập nhật điểm số từ người chơi
    socket.on('submitScore', (data) => {
        const { roomCode, points } = data;
        if (rooms[roomCode] && rooms[roomCode].players[socket.id]) {
            rooms[roomCode].players[socket.id].score += points;
            // Gửi bảng xếp hạng mới cho cả phòng (bao gồm cả Host)
            const leaderboard = Object.values(rooms[roomCode].players)
                .sort((a, b) => b.score - a.score);
            io.to(roomCode).emit('updateLeaderboard', leaderboard);
        }
    });

    socket.on('disconnect', () => {
        console.log('Ngắt kết nối:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});