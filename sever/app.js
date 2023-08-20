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
function startAuction(initiator) {   //傳入拍賣主
  if (!currentAuction && auctionStack.length > 0) {
    currentAuction = auctionStack.pop();  // 將第一張動物卡翻開，作為目前的拍賣
    currentAuction.initiator = initiator;  // 將拍賣主資訊存入 currentAuction
    currentAuction.currentBidder = null;  //初始無人出價
    currentAuction.currentBid = 0;  //初始金額為0

    io.emit('new-auction', currentAuction);  // 將目前拍賣傳給所有人


    // 在開始拍賣時，設定相關的 socket.on 事件

    //倒數
    let countdownTimeout = null;
    let countdownValue = 15; // 倒數秒數，可依需求調整

    socket.on('bid', (bidMoney) => {  //出價
      if (currentAuction && bidMoney > currentAuction.currentBid &&  //有拍賣且金額更大
          currentAuction.initiator !== socket.id) {  //且出價者不等於拍賣主
        currentAuction.currentBid = bidMoney;  //更新金額
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
        if (countdownValue > 0) {  //倒數中
          io.emit('auction-countdown', countdownValue);  // 告訴所有玩家目前的倒數秒數
          countdownValue--;  //倒數
        } else {  //倒數結束
          clearInterval(countdownTimeout);  //停止呼叫
          io.emit('auction-countdown-end');  //告訴所有人倒數結束

          //最高金額及出價者
          const highestBid = currentAuction.currentBid;
          const highestBidder = players.find(player => player.id === currentAuction.currentBidder);
          // 傳送最高出價者及金額的資訊給拍賣主
          io.to(currentAuction.initiator.id).emit('highest-bid-info', {
            bidder: highestBidder, //出價者(可能沒有)
            bidAmount: highestBid  //出價金額(可為0元)
          });

          // 等待拍賣主決定是否自己買下 answer{moneyCard:[],isBuy:""}
          socket.on('buy-myself', (answer) => {
            if (currentAuction && currentAuction.initiator.id === socket.id) {
              const animalCard = currentAuction.animalCard;
              const price = currentAuction.currentBid;

              if (answer.isBuy === 'buy') {
                
                // 拍賣主選擇自己買下，更新遊戲狀態、玩家金錢等
                const initiator = players.find(player => player.id === socket.id);
                if (initiator && initiator.money[0] >= price) {
                  // 扣除拍賣主金錢
                  initiator.money = removeBfromA(initiator.money,answer.moneyCard);
                  // initiator.money -= price;
                  // 將動物卡加入拍賣主的動物卡列表 
                  initiator.cards.push(animalCard);
                }
              } else {// 拍賣主決定不買，則最高出價者得標
                // 告訴出價者拍賣主決定不買
                io.to(highestBidder.id).emit('initiator-not-buy-it', {
                  bidder: highestBidder, //出價者(可能沒有)
                  bidAmount: highestBid  //出價金額(可為0元)
                });
                //等待出價者回傳的金錢卡訊息 
                socket.on('pay-money',(BidderMoneyCards) => {
                  // 確認金錢正確
                  if(BidderMoneyCards.sum() >= highestBid){
                    // 更新玩家資訊
                    highestBidder.money = removeBfromA(highestBidder.money,BidderAnswer.moneyCard);
                    highestBidder.cards.push(animalCard);
                    // 將錢交給拍賣主
                  }
                });
              }
              // 將更新後的玩家資訊發送給所有玩家
              io.emit('player-list', players);
              // 告訴所有玩家拍賣結束
              io.emit('end-auction');
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

// function removeArr2fromArr1(array1,array2){
//   let arrayResult = array1
//   for(let element in array2){
//     console.log(element);
//     arrayResult.remove(element);
//   }
//   return arrayResult;
// }

// // Array.prototype.removeElements = function(elements) {  //移除陣列中多個元素
// //   for(let element in elements){
// //     this.remove(element);
// //   }
// // }

// Array.prototype.remove = function(value) {  //移除陣列中一個元素
//   this.splice(this.indexOf(value), 1);
// }

function removeBfromA(arr1, arr2) {
  // 創建一個新的數組來存儲結果
  let result = [];
  // 遍歷第一個數組
  for (let i = 0; i < arr1.length; i++) {
    // 獲取當前元素
    let element = arr1[i];
    // 檢查它是否在第二個數組中
    let index = arr2.indexOf(element);
    // 如果在，就移除它
    if (index > -1) {
      arr1.splice(i, 1); // 從第一個數組中移除
      arr2.splice(index, 1); // 從第二個數組中移除
      i--; // 調整索引
    } else {
      // 如果不在，就添加到結果中
      result.push(element);
    }
  }
  // 返回結果
  return result;
}


Array.prototype.sum = function () {  //回傳array總和
  let sum = 0;
  this.forEach( num => {
    sum += num;
  })
  return sum;
}