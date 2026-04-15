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
        if (rooms[roomCode]) {
            socket.join(roomCode);
            rooms[roomCode].players[socket.id] = {
                name: playerName,
                score: 0
            };

            // GỬI THÊM TRẠNG THÁI PHÒNG (status: 'waiting' hoặc 'playing')
            socket.emit('joinSuccess', { 
                roomCode, 
                status: rooms[roomCode].status 
            });

            // Thông báo cập nhật danh sách cho mọi người
            io.to(roomCode).emit('updatePlayerList', Object.values(rooms[roomCode].players));
            
            // Nếu game đang chơi, gửi bảng xếp hạng hiện tại cho người mới vào luôn
            if(rooms[roomCode].status === 'playing') {
                const leaderboard = Object.values(rooms[roomCode].players)
                    .sort((a, b) => b.score - a.score);
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