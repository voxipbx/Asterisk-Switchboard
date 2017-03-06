# Asterisk-Switchboard
Asterisk Switchboard

This is a Node-js server side asterisk switchboard.

asterisk configuration:
<pre>
exten => _opXX_X.,1,NoOp(Sipheader)
exten => _opXX_X.,n,SET(SWITCHBOARD_EXTENSION=${EXTEN})
exten => _opXX_X.,n,SIPAddHeader(Call-Info:answer-after=0)
exten => _opXX_X.,n,Dial(${EXTEN},14)
exten => _opXX_X.,n,NoOp(DIALSTATUS=${DIALSTATUS})
exten => _opXX_X.,n,Goto(op${EXTEN:2:2}_hold_${EXTEN},1)

exten => _opXX_hold_X.,1,NoOp(Operator hold)
exten => _opXX_hold_X.,n,Answer()
exten => _opXX_hold_X.,n,MusicOnHold(default,30000)
exten => _opXX_hold_X.,n,Hangup()

exten => _opXX_tra_X.,1,NoOp(Operator transfer)
exten => _opXX_tra_X.,n,Answer()
exten => _opXX_tra_X.,n,MusicOnHold(default,6000)
exten => _opXX_tra_X.,n,Hangup()
</pre>

Request via web: variables user and queue
*user = extension of user/operator
*queue = queue name in asterisk

http://switchboard_ip:8081/?user=201&queue=hfd
