const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// 玩家資訊和遊戲狀態
const players = [];
const auctionStack = [/* 初始的動物卡堆 */];
let currentAuction = null; // 目前的拍賣，被多個玩家操作的全局變數。
//因為在拍賣過程中，不同玩家的操作可能會影響到拍賣的狀態，並需要及時同步。
//如果我們只在接收到'start-auction'事件時才創建currentAuction，
//那麼每個玩家都有可能在並行操作的情況下創建自己的currentAuction實例，這會導致狀態的不一致。
//這可能會讓不同玩家看到不同的拍賣狀態，進而影響遊戲的公平性。
const trades = [];  //交易列表


// ... 初始化遊戲狀態 ...


// 启动 HTTP 服务器
http.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});

/* socket.io 連線事件
"io.on('connection', ...)"是一個特殊的事件處理器，
它處理新客戶端連線的事件。當有新的客戶端連線到伺服器時，
"io.on('connection', ...)"內部的程式碼會被執行一次，
並且你可以在這個內部區塊內設置該客戶端的各種操作和事件監聽。*/
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
  socket.on('start-auction', () => {  //開始拍賣
    if (!currentAuction && auctionStack.length > 0) {
      currentAuction = auctionStack.pop();  //將第一張動物卡翻開，作為目前的拍賣

      // 將拍賣主資訊存入currentAuction
      currentAuction.initiator = players.find(player => player.id === socket.id);
      currentAuction.currentBidder = null;
      currentAuction.currentBid = 0;

      io.emit('new-auction', currentAuction);  //將目前拍賣傳給所有人
    }
  });

  socket.on('bid', (bidAmount) => {  //出價
    if (currentAuction && bidAmount > currentAuction.currentBid && //有拍賣且金額更大
        currentAuction.initiator != socket.id) {  //且出價者不等於拍賣主
      currentAuction.currentBid = bidAmount;  //更新金額
      currentAuction.currentBidder = socket.id;  //更新出價者
      io.emit('update-auction', currentAuction);  //發給所有人
    }
  });

  // 當倒數結束，沒有人喊價時
  socket.on('auction-countdown-end', () => {
    if (currentAuction && currentAuction.currentBidder === socket.id) {
      const highestBid = currentAuction.currentBid;
      const highestBidder = players.find(player => player.id === currentAuction.currentBidder);
  
      if (highestBidder) {  // 是否有人出價
        // 傳送最高出價者及金額的資訊給拍賣主
        io.to(currentAuction.initiator.id).emit('highest-bid-info', {
        bidder: highestBidder,
        bidAmount: highestBid
        });
      }
  
      // 等待拍賣主決定是否自己買下
      socket.on('buy-myself', (answer) => {
        if (answer == "buy") {
          // 賣給拍賣主，更新遊戲狀態、玩家金錢等
          // 你需要根據你的遊戲邏輯來處理這部分
        } else {
          // 拍賣主決定不買，則最高出價者得標
          // 你需要根據你的遊戲邏輯來處理這部分
        }
      });
      
      // 結束拍賣，重置拍賣相關狀態
      currentAuction = null;
      io.emit('end-auction');
    }
  });
  

  // 處理幕後交易
  socket.on('initiate-trade', (targetPlayerId, animalCard) => {  //發起交易
    const initiator = players.find(player => player.id === socket.id);  //發起者
    const targetPlayer = players.find(player => player.id === targetPlayerId);  //接受者

    if (initiator && targetPlayer) {  //發起及接受者都在players中
      const trade = {  //交易
        initiator: initiator,  //發起者
        targetPlayer: targetPlayer,  //接受者
        animalCard: animalCard,  //要交換的動物卡
        bid: null  //出價
      };
      trades.push(trade);
      io.to(targetPlayerId).emit('receive-trade', trade);  //向接受者發起交易
    }
  });

  socket.on('accept-trade', (tradeId) => {  //接受交易
    const trade = trades.find(t => t.targetPlayer.id === socket.id && t.id === tradeId);
    if (trade) {
      // 處理交易：交換動物卡
      // 更新玩家的動物卡等等...
      trades.splice(trades.indexOf(trade), 1);
      io.to(trade.initiator.id).emit('trade-accepted', tradeId);
    }
  });

  socket.on('counter-bid', (tradeId, bidAmount) => {  //還價
    const trade = trades.find(t => t.initiator.id === socket.id && t.id === tradeId);
    if (trade) {
      trade.bid = bidAmount;
      io.to(trade.targetPlayer.id).emit('receive-counter-bid', trade);
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
