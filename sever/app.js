const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// 玩家資訊和遊戲狀態
const players = [];  //玩家列表
const auctionStack = [/* 初始的動物卡堆 */];
let currentAuction = null; // 目前的拍賣，被多個玩家操作的全局變數。
const trades = [];  //交易列表

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
    const player = {   //創建新玩家
      id: socket.id,
      name: playerName,
      money: [0,0,10,10,10,10],
      cards: [] };
    players.push(player);  //加到玩家列表

    socket.emit('player-info', player);
    io.emit('player-list', players);
  });

  //發出開始遊戲
  socket.on('start-game', (playerName) => {
    if(players.length>=3 && players.length<=5){  //確認符合人數
    initializeGame();  //初始化遊戲並開始第一回合
    io.emit('game-start', );  //告訴所有玩家遊戲開始
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

// ... 初始化遊戲狀態 ...
function initializeGame() {
  // 初始化 players、auctionStack 等
  // ...

  // 開始第一個回合
  playRound(0);
}

//遊戲中一個回合
function playRound(currentPlayerIndex) {
  const currentPlayer = players[currentPlayerIndex];

  // 告訴當前玩家開始回合
  io.to(currentPlayer.id).emit('your-turn');

  // 等待玩家動作
  socket.on('player-action', (action) => {
    if (action === 'auction') {
      startAuction(currentPlayer);  // 開始拍賣
    } else if (action === 'trade') {
      // 處理交易選項
      // ...
    } else{  //pass當拍賣卡用完時，可以放棄回合

    }

    // 計算結果
    // ...

    // 告訴所有玩家結果
    io.emit('round-result', result);

    // 檢查是否結束遊戲
    if(auctionStack.length != 0 && 1){ //檢查是否所有玩家都pass
      // 換下一位玩家進行回合
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
      playRound(nextPlayerIndex);
    }
      
  });
}

// 開始拍賣
function startAuction(initiator) {
  if (!currentAuction && auctionStack.length > 0) {
    currentAuction = auctionStack.pop();  // 將第一張動物卡翻開，作為目前的拍賣
    currentAuction.initiator = initiator;  // 將拍賣主資訊存入 currentAuction
    currentAuction.currentBidder = null;  //初始無人出價
    currentAuction.currentBid = 0;  //初始金額為0

    io.emit('new-auction', currentAuction);  // 將目前拍賣傳給所有人


    // 在開始拍賣時，設定相關的 socket.on 事件

    //倒數
    let countdownTimeout = null;
    let countdownValue = 3; // 倒數秒數，可依需求調整

    socket.on('bid', (bidAmount) => {  //出價
      if (currentAuction && bidAmount > currentAuction.currentBid &&  //有拍賣且金額更大
          currentAuction.initiator !== socket.id) {  //且出價者不等於拍賣主
        currentAuction.currentBid = bidAmount;  //更新金額
        currentAuction.currentBidder = socket.id;  //更新出價者
        io.emit('update-auction', currentAuction);  //發給所有人

        // 重新開始倒數
        if (countdownTimeout) {
          clearInterval(countdownTimeout);
        }
        startCountdown();
      }
    });

   
    // 開始倒數
    function startCountdown() {
      countdownTimeout = setInterval(() => { //每隔一秒就呼叫一次
        if (countdownValue > 0) {
          io.emit('auction-countdown', countdownValue);  // 告訴所有玩家目前的倒數秒數
          countdownValue--;
        } else {
          clearInterval(countdownTimeout);  //停止呼叫
          io.emit('auction-countdown-end');  //告訴所有人倒數結束

          // 當倒數結束，沒有人喊價時
          const highestBid = currentAuction.currentBid;
          const highestBidder = players.find(player => player.id === currentAuction.currentBidder);
          // 傳送最高出價者及金額的資訊給拍賣主
          io.to(currentAuction.initiator.id).emit('highest-bid-info', {
            bidder: highestBidder, //出價者(可能沒有)
            bidAmount: highestBid  //出價金額(可為0元)
          });

          //等待拍賣主決定是否自己買下
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
      }, 1000);
    }
  }
}

// // 處理幕後交易
// socket.on('initiate-trade', (targetPlayerId, animalCard) => {  //發起交易
//   const initiator = players.find(player => player.id === socket.id);  //發起者
//   const targetPlayer = players.find(player => player.id === targetPlayerId);  //接受者

//   if (initiator && targetPlayer) {  //發起及接受者都在players中
//     const trade = {  //交易
//       initiator: initiator,  //發起者
//       targetPlayer: targetPlayer,  //接受者
//       animalCard: animalCard,  //要交換的動物卡
//       bid: null  //出價
//     };
//     trades.push(trade);
//     io.to(targetPlayerId).emit('receive-trade', trade);  //向接受者發起交易
//   }
// });

// socket.on('accept-trade', (tradeId) => {  //接受交易
//   const trade = trades.find(t => t.targetPlayer.id === socket.id && t.id === tradeId);
//   if (trade) {
//     // 處理交易：交換動物卡
//     // 更新玩家的動物卡等等...
//     trades.splice(trades.indexOf(trade), 1);
//     io.to(trade.initiator.id).emit('trade-accepted', tradeId);
//   }
// });

// socket.on('counter-bid', (tradeId, bidAmount) => {  //還價
//   const trade = trades.find(t => t.initiator.id === socket.id && t.id === tradeId);
//   if (trade) {
//     trade.bid = bidAmount;
//     io.to(trade.targetPlayer.id).emit('receive-counter-bid', trade);
//   }
// });