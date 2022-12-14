const {Transaction} = require("../models/transaction");
const axios = require('axios');
const http2 = require('http2');
const fs = require('fs');
const BigNumber = require('bignumber.js');
const{v4:uuidv4} = require('uuid');
const config = require("config");

async function getTransactionDetailByAddress(address, isTestnet){
    try {
        const result = await axios.get(`${isTestnet ?
            config.get("blocksteam_testnet_uri") :
            config.get("blocksteam_mainnet_uri")}/address/${address}/txs`);
        if (result && result.data) {
            return result.data;
        }
        return [];
    }
    catch (ex) {
        console.log(`Error getting transactions for address: ${address}. Exception is ${ex}`);
    }
}

async function getTransactionDetailByTxId(txId, isTestnet) {
    const result = await axios.get(`${isTestnet ?
        config.get("blocksteam_testnet_uri") :
        config.get("blocksteam_mainnet_uri")}/tx/${txId}`);
    if (result && result.data) {
        return result.data;
    }
    return null;
}

function getReceivedAmount(address, tx) {
    let amount = 0;
    for (const vout of tx.vout) {
        if (vout.scriptpubkey_address === address) {
            amount += vout.value;
        }
    }
    return amount;
}

function satoshiToBTC(satoshi) {
    return new BigNumber(satoshi).dividedBy(100000000).toString(10);
}

function getAPNSPayload(txDetail) {
    const title = txDetail?.transaction?.isBroadcasted ? 'Transaction Sent' : 'Received Transaction';
    const btc = satoshiToBTC(txDetail?.amount);
    const body = txDetail?.transaction?.isBroadcasted ? `Withdrawn ${btc} BTC` : `Received Transaction ${btc} BTC`;
    const fcmPayload = {
        data: {
            walletId: txDetail?.transaction.walletId,
        },
        notification: {
            title: title,
            body: body,
            badge: 1,
            tag: txDetail?.transaction.walletId,
            sound: "default",
        }
    };
    return fcmPayload;
}

function pushAPNS(txDetail) {
    const apnsPayload = getAPNSPayload(txDetail);
    const pemBuffer = Buffer.from(process.env.APNS_PEM, 'base64').toString('ascii');
    const client = http2.connect(process.env.APNS_PUSH_URL, {
        key: pemBuffer,
        cert: pemBuffer,
    });

    client.on("error", (err) => console.error(err));

    const headers = {
        ":method": "POST",
        "apns-topic": process.env.APNS_TOPIC,
        "apns-collapse-id": uuidv4(),
        "apns-expiration": Math.floor(+new Date() / 1000 + 3600 * 24),
        ":scheme": "https",
        ":path": "/3/device/" + txDetail?.transaction?.token,
    };

    const request = client.request(headers);

    let responseJson = {};
    request.on("response", (headers, flags) => {
        for (const name in headers) {
            responseJson[name] = headers[name];
        }
    });
    request.on("error", (err) => {
        console.error("Apple push error:", err);

        const responseJson = {};
        responseJson["error"] = err;
        client.close();
    });

    request.setEncoding("utf8");

    let data = "";
    request.on("data", (chunk) => {
        data += chunk;
    });

    request.write(JSON.stringify(apnsPayload));

    request.on("end", () => {
        if (Object.keys(responseJson).length === 0) {
            return;
        }
        responseJson["data"] = data;
        client.close();
        console.log(responseJson);
    });
    request.end();
}


async function processTransactions() {
    const txs = await Transaction.find() || [];
    console.log(`pulled ${txs.length} transactions`);
    if (txs && txs.length === 0) {
        return;
    }

    let addressesToDelete = [];
    let addressesToSendNotification = [];

    for (const transaction of txs) {
        if (!transaction.isBroadcasted) {
            const addressTxs = await getTransactionDetailByAddress(transaction.address, transaction.isTestnet) || [];
            if (addressTxs.length > 0) {
                for (const tx of addressTxs) {
                    if (tx) {
                        const amount = getReceivedAmount(transaction.address, tx);
                        addressesToSendNotification.push({ transaction: transaction, amount: amount, txId: tx.txId });
                        addressesToDelete.push(transaction._id);
                    }
                }
            }
            else {
                const dateToCompare = new Date().toISOString().slice(0, 10);
                const dateToBeCompared = transaction?.addedDate.toISOString().slice(0, 10);
                const diffInMonths = new Date(dateToCompare) - new Date(dateToBeCompared);
                const diffInDays = diffInMonths / (1000 * 60 * 60 * 24);
                console.log(diffInDays);
                if (diffInDays > 3) {
                    addressesToDelete.push(transaction._id);
                }
            }
        }

        if (transaction.isBroadcasted) {
            const tx = await getTransactionDetailByTxId(transaction.txId, transaction.isTestnet) || [];
            if (tx) {
                const amount = getReceivedAmount(transaction.address, tx);
                addressesToSendNotification.push({ transaction: transaction, amount: -amount, txId: tx.txId });
                addressesToDelete.push(transaction._id);
            }
        }
    }

    if (addressesToDelete.length > 0) {
        await Transaction.deleteMany({ _id: { $in: addressesToDelete } });
    }
    console.log(addressesToSendNotification.length);
    if (addressesToSendNotification.length > 0) {
        for (const tx of addressesToSendNotification) {
            if (tx?.transaction?.os === "ios") {
                pushAPNS(tx);
            }
        }
    }
}

async function checkConfirmationStatusForTransactions() {
    await processTransactions();
    await new Promise(res => setTimeout(res, 100000))
}

module.exports = async () => {
    console.log("Worker started..");

    while (true) {
        console.log((new Date()).toISOString().slice(0, 19).replace(/-/g, "/").replace("T", " "));
        await checkConfirmationStatusForTransactions();
    }
}

