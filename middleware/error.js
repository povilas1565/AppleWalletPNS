module.exports = function(error, request, response, next) {
    console.log(error);
    response.status(500).send(error.message, error);
};
