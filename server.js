const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

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
    socket.on('joinRoom', (data) => {
        const { roomCode, playerName } = data;
        const room = rooms[roomCode];
        if (!room) return socket.emit('errorMsg', 'Phòng không tồn tại!');

        const nameKey = playerName.trim();
        let existingPlayer = Object.values(room.players).find(p => p.name === nameKey);

        if (existingPlayer) {
            if (existingPlayer.isActive) {
                return socket.emit('errorMsg', 'Tên này đang được sử dụng!');
            } else {
                delete room.players[existingPlayer.lastSocketId]; 
                room.players[socket.id] = existingPlayer;
                existingPlayer.isActive = true;
                existingPlayer.lastSocketId = socket.id;
                console.log(`Người chơi ${nameKey} đã quay lại.`);
            }
        } else {
            room.players[socket.id] = {
                name: nameKey,
                score: 0,
                isActive: true,
                lastSocketId: socket.id
            };
        }

        socket.join(roomCode);
        socket.roomCode = roomCode; 
        socket.playerName = nameKey;

        socket.emit('joinSuccess', { roomCode, status: room.status });
        broadcastLeaderboard(roomCode);
        io.to(roomCode).emit('updatePlayerList', getActivePlayers(roomCode));
    });

    // 3. Điều khiển trận đấu (Start/End)
    socket.on('startGame', (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].status = 'playing';
            io.to(roomCode).emit('gameStarted');
        }
    });

// Host báo kết thúc trận đấu
    socket.on('endGame', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            room.status = 'finished';
            console.log(`--- PHÒNG ${roomCode} KẾT THÚC ---`);
            
            // Gửi cho TẤT CẢ mọi người trong phòng
            io.in(roomCode).emit('gameEnded'); 
        } else {
            console.log(`Lỗi: Không tìm thấy phòng ${roomCode} để kết thúc.`);
        }
    });

    // 4. CẬP NHẬT ĐIỂM (CHỈ GIỮ LẠI 1 ĐOẠN NÀY)
    socket.on('submitScore', (data) => {
        const { roomCode, points } = data;
        const room = rooms[roomCode];
        // Chỉ cộng điểm nếu game đang trong trạng thái 'playing'
        if (room && room.status === 'playing' && room.players[socket.id]) {
            room.players[socket.id].score += points;
            broadcastLeaderboard(roomCode);
        }
    });

    // 5. Ngắt kết nối
    socket.on('disconnect', () => {
        const roomCode = socket.roomCode;
        const name = socket.playerName;

        if (roomCode && rooms[roomCode] && rooms[roomCode].players[socket.id]) {
            rooms[roomCode].players[socket.id].isActive = false;
            console.log(`Người chơi ${name} đã ngắt kết nối.`);
            broadcastLeaderboard(roomCode);
            io.to(roomCode).emit('updatePlayerList', getActivePlayers(roomCode));
        }
    });

    // Các hàm bổ trợ
    function getActivePlayers(roomCode) {
        if (!rooms[roomCode]) return [];
        return Object.values(rooms[roomCode].players).filter(p => p.isActive);
    }

    function broadcastLeaderboard(roomCode) {
        if (!rooms[roomCode]) return;
        const leaderboard = Object.values(rooms[roomCode].players)
            .sort((a, b) => b.score - a.score);
        io.to(roomCode).emit('updateLeaderboard', leaderboard);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});