const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 3000;
const bannedUsers = new Set();
const activeUsers = {}; // 接続中ユーザーのリアルタイム位置情報データベース

io.on('connection', (socket) => {
  if (bannedUsers.has(socket.handshake.address) || bannedUsers.has(socket.id)) {
    socket.disconnect(true);
    return;
  }

  console.log(`接続: ${socket.id}`);

  // 乗務開始（ログイン）
  socket.on('user-login', ({ name, role }) => {
    activeUsers[socket.id] = {
      id: socket.id,
      name: name || '名無し乗務員',
      role: role,
      location: '未接続'
    };
    // 全員に最新の配置データを同期
    sendGlobalUserUpdate();
  });

  // 無線VCへの接続
  socket.on('join-frequency', ({ frequency, displayLabel }) => {
    const roomID = `room_${frequency.replace('.', '')}`;
    const room = io.sockets.adapter.rooms.get(roomID);

    if (room && room.size >= 5) {
      socket.emit('join-failed', '定員（5名）に達しているため、このVCには入れません。');
      return;
    }

    // 既存の部屋を抜ける
    Array.from(socket.rooms).forEach(r => {
      if (r !== socket.id) {
        socket.leave(r);
        updateRoomCount(r);
      }
    });

    socket.join(roomID);
    socket.currentRoom = roomID;
    socket.frequency = frequency;

    if (activeUsers[socket.id]) {
      activeUsers[socket.id].location = displayLabel;
    }

    socket.emit('join-success', { frequency, displayLabel });
    updateRoomCount(roomID);
    sendGlobalUserUpdate();
  });

  // 📝 【重要】指令員からの個別・一斉通告メッセージを中継して全社員に送る
  socket.on('send-dispatcher-notice', (data) => {
    console.log("通告中継送信:", data);
    io.emit('receive-dispatcher-notice', data); // 全員に向けてブロードキャスト
  });

  // 管理者コマンド（強制切断など）
  socket.on('admin-command', ({ action, freq }) => {
    const roomID = `room_${freq.replace('.', '')}`;
    if (action === 'KICK') io.to(roomID).emit('admin-force-disconnect');
    if (action === 'MUTE') io.to(roomID).emit('admin-force-mute');
  });

  // 回線切断
  socket.on('leave-frequency', () => {
    if (socket.currentRoom) {
      const oldRoom = socket.currentRoom;
      socket.leave(oldRoom);
      socket.currentRoom = null;
      if (activeUsers[socket.id]) {
        activeUsers[socket.id].location = '未接続';
      }
      updateRoomCount(oldRoom);
      sendGlobalUserUpdate();
    }
  });

  socket.on('disconnect', () => {
    delete activeUsers[socket.id];
    if (socket.currentRoom) {
      updateRoomCount(socket.currentRoom);
    }
    sendGlobalUserUpdate();
  });
});

function updateRoomCount(roomID) {
  const room = io.sockets.adapter.rooms.get(roomID);
  const count = room ? room.size : 0;
  io.to(roomID).emit('room-count-update', count);
}

// 🌐 運転士・信号・指令全員にリアルタイム配置リストを同期する関数
function sendGlobalUserUpdate() {
  io.emit('global-crew-monitor-data', Object.values(activeUsers));
}

server.listen(PORT, () => {
  console.log(`鉄道無線サーバー起動 ポート: ${PORT}`);
});