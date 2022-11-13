const express = require("express");
const router = express.Router();
const ObjectId = express('mongodb').ObjectId;
const {Transaction, validate, validateTransactionToDelete} = require("../models/transaction");
const {response} = require("express");

function mapTransaction(tx) {
    return {
        token: tx.token,
        address: tx.address,
        os: tx.os,
        txId: tx.txId,
        isBroadcasted: tx.isBroadcasted,
        walletId: tx.walletId,
        isTestnet: tx.isTestnet
    };
}

router.post("/subscribe", async(request, response) => {
    const error = validate(request.body);
    if (error) return response.status(400).send(error);
    const tx = await Transaction.findOne({address: request.body?.address});
    if (!tx || (tx.walletId !== request.body.walletId)) {
        let tx = new Transaction(mapTransaction(request.body));
        tx = await tx.save();
        response.send('Added to queue');
        return;
    }
    response.send('Address is already added to queue');
});

router.post("/unsubscribe", async(request, response) => {
    const error = validateTransactionToDelete(request.body);
    if (error) return response.status(400).send(error);
    const {txId} = request.body;
    const tx = await Transaction.findOne({txId:txId});
    console.log(tx);
    if (!tx) {
        return response.status(400).send("The transaction with given address or transaction is not found.");
    }

    await tx.deleteOne({"_id": ObjectId(tx._id)});

    response.send(true);
});

module.exports = router;
