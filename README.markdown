# Requirements

nodejs nodejs-legacy npm libtag1-dev


# Installation :

npm install


# Usage :

./nestor [kill]


# Configuration :

auth
    admin
        disabled        bool, disable admin password
        password        string, admin password
    twitter
        key             string, twitter auth app key
        secret          string, twitter auth app secret
database                string, database URI
server
    host                string, webserver host (default: "localhost")
    port                int, webserver port (default: 80 or 443)
    ssl                 object, enable SSL
        certFile        string, path to SSL certificate
        keyFile         string, path to SSL key
    sessionDays         int, session expiration time in days
    cookieSecret        string, cookie encoding key (please change !)
    rest
        defaultLimit    int, default limit for REST collections
log4js                  object, log4js configuration
plugins                 object, active plugins with their configuration
    nestor-downloads
        incoming        string, directory to put downloaded files into
