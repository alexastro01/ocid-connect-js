/*!
* Copyright 2024-Present Animoca Brands Corporation Ltd. 
* 
* Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import AuthInfoManager from './lib/AuthInfoManager';
import TokenManager from './lib/TokenManager';
import TransactionManager from './lib/TransactionManager';
import { LocalStorageManager } from './lib/StorageManager';
import { createPkceMeta, parseJwt, parseUrl, prepareTokenParams } from './utils';
import { buildAuthEndpointUrl } from './endpoints';
import { AuthError } from './utils/errors';

export class OCAuthCore
{
    tokenManager;
    authInfoManager;
    transactionManager;
    redirectUri;
    loginEndPoint;

    constructor ( loginEndpoint, redirectUri, transactionManager, tokenManager )
    {
        this.transactionManager = transactionManager;
        this.tokenManager = tokenManager;
        this.authInfoManager = new AuthInfoManager();
        this.loginEndPoint = loginEndpoint;
        this.redirectUri = redirectUri;
        this.syncAuthInfo();
    }

    clearStorage ()
    {
        this.transactionManager.clearStorage();
        this.tokenManager.clear();
    }

    async signInWithRedirect ( params )
    {
        // we use ONLY code flow with PKCE, so lacks a lot of options
        // available in other OAuth SDKs.
        const paramsClone = Object.assign( {}, params );
        paramsClone.redirectUri = this.redirectUri;
        const signinParams = await prepareTokenParams( paramsClone );
        const meta = createPkceMeta( signinParams );
        this.transactionManager.save( meta );
        const requestUrl = buildAuthEndpointUrl( signinParams, this.loginEndPoint );
        window.location.assign( requestUrl );
    }

    async handleLoginRedirect ()
    {
        const urlParams = parseUrl();
        // Again we only handle PKCE code flow
        if ( urlParams.code )
        {
            const meta = this.transactionManager.getTransactionMeta();
            const { codeVerifier } = meta;
            if ( codeVerifier )
            {
                // we used pkce mode, use it
                await this.tokenManager.exchangeTokenFromCode( urlParams.code, codeVerifier );
                // clear transaction meta, coz it's completed
                this.transactionManager.clear();
                this.syncAuthInfo();
                return this.getAuthState();
            } else
            {
                throw new AuthError( 'codeVerifier not found, cannot complete flow' );
            }
        }

        // no code found, nothing to do 
        return {};
    }

    isAuthenticated ()
    {
        // if both token exist and not expired
        return !this.tokenManager.hasExpired();
    }

    syncAuthInfo ()
    {
        if ( this.tokenManager.hasExpired() )
        {
            this.authInfoManager.clear();
        } else
        {
            const idToken = this.tokenManager.getIdToken();
            const { edu_username, eth_address } = parseJwt( idToken );
            this.authInfoManager.setIdInfo( {
                edu_username,
                eth_address,
            } );
        }
    }

    getAuthState ()
    {
        const authState = {
            accessToken: this.getAccessToken(),
            idToken: this.getIdToken(),
            isAuthenticated: this.isAuthenticated(),
        };

        return authState;
    }

    getAuthInfo ()
    {
        return this.authInfoManager.getAuthInfo();
    }

    getIdToken ()
    {
        return this.tokenManager.getIdToken();
    }

    getAccessToken ()
    {
        return this.tokenManager.getAccessToken();
    }
}

class OCAuthLS extends OCAuthCore
{
    constructor ( loginEndPoint, tokenEndpoint, redirectUri, publicKey )
    {
        const pkceTransactionManager = new TransactionManager( LocalStorageManager );
        const tokenManager = new TokenManager( LocalStorageManager, tokenEndpoint, publicKey );

        super( loginEndPoint, redirectUri, pkceTransactionManager, tokenManager );
    }
}

const LIVE_PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBIDHtLbgVM76SXZ4iuIjuO+ERQPnVpJzagOsZdYxFG3ZJmvfdpr/Z29SLUbdZWafrOlAVlKe1Ovf/tcH671tTw==';
const SANDBOX_PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/EymMLXd/MVYPK5r2xXQj91ZVvX3OQ+QagvR2N6lCvRVjnzmOtPRTf+u5g1RliWnmuxbV3gTm0/0VuV/40Salg==';
export class OCAuthLive extends OCAuthLS
{
    constructor ( opts = {} )
    {
        const { tokenEndPoint: overrideTokenEndpoint, loginEndPoint: overrideLoginEndpoint, publicKey: overridePublicKey, redirectUri } = opts;
        const tokenEndpoint = overrideTokenEndpoint || 'https://api.login.opencampus.xyz/auth/token';
        const loginEndpoint = overrideLoginEndpoint || 'https://api.login.opencampus.xyz/auth/login';
        const publicKey = overridePublicKey || LIVE_PUBLIC_KEY;

        super( loginEndpoint, tokenEndpoint, redirectUri, publicKey );
    }
}

export class OCAuthSandbox extends OCAuthLS
{
    constructor ( opts = {} )
    {
        const { tokenEndPoint: overrideTokenEndpoint, loginEndPoint: overrideLoginEndpoint, publicKey: overridePublicKey, redirectUri } = opts;
        const tokenEndpoint = overrideTokenEndpoint || 'https://api.login.sandbox.opencampus.xyz/auth/token';
        const loginEndpoint = overrideLoginEndpoint || 'https://api.login.sandbox.opencampus.xyz/auth/login';
        const publicKey = overridePublicKey || SANDBOX_PUBLIC_KEY;

        super( loginEndpoint, tokenEndpoint, redirectUri, publicKey );
    }
}
