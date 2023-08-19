const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// 玩家資訊和遊戲狀態
const players = [];
const auctionStack = [/* 初始的動物卡堆 */];
let currentAuction = null; // 目前的拍賣

// 启动 HTTP 服务器
http.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});

// socket.io 連線事件
io.on('connection', (socket) => {
  console.log('A user connected');

  // 新玩家連線
  socket.on('join', (playerName) => {
    const player = { id: socket.id, name: playerName, money: 1000, cards: [] };
    players.push(player);
    socket.emit('player-info', player);
    io.emit('player-list', players);
  });

  // 拍賣
  socket.on('start-auction', () => {
    if (!currentAuction && auctionStack.length > 0) {
      currentAuction = auctionStack.pop();
      io.emit('new-auction', currentAuction);
    }
  });

  socket.on('bid', (bidAmount) => {
    if (currentAuction && bidAmount > currentAuction.currentBid) {
      currentAuction.currentBid = bidAmount;
      currentAuction.currentBidder = socket.id;
      io.emit('update-auction', currentAuction);
    }
  });

  socket.on('pass', () => {
    if (currentAuction && currentAuction.currentBidder === socket.id) {
      currentAuction = null;
      io.emit('end-auction');
    }
  });

  // 斷開連線
  socket.on('disconnect', () => {
    console.log('A user disconnected');
    const disconnectedPlayer = players.find(player => player.id === socket.id);
    if (disconnectedPlayer) {
      players.splice(players.indexOf(disconnectedPlayer), 1);
      io.emit('player-list', players);
    }
  });
});
