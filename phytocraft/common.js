
var submitted = false;
var now = new Date();
var addreturn = "\n";

function setTranistion(pageName){
	//alert("setting transition to " + pageName);
	setTimeout("setContent('pageName')", 1000);
}


function submitOrder(){
	if(!submitted){
		document.orderForm.submit();
		submitted=true;
		document.location="potwierdzenieZamowienia.html";
	}
	return true;
	
	
}


function setContent(pageName){
	//alert("setting to " + pageName);
    document.location=pageName;
}





/* used for multi-page display of content */
var showingPage=1;	
var lastPage=1;

function showPageNumber(pageNumber){
	//alert("show: " + pageNumber + " hide: " + showingPage);
    if(showingPage!=pageNumber){
		if(showingPage>0){
			document.getElementById('page'+showingPage).className = 'hide';
		}
		document.getElementById('page'+pageNumber).className='show';
		showingPage=pageNumber;						
		document.getElementById('currentPageNumber').childNodes[0].nodeValue = showingPage;
		
	 }
	
}				

function showNextPage() {
    if(showingPage<lastPage){
		showPageNumber(showingPage+1);
		document.getElementById('firstButton').className='button'; 
		document.getElementById('previousButton').className='button'; 
    }
    if(showingPage==lastPage){
    	document.getElementById('lastButton').className='buttonDisabled';
		document.getElementById('nextButton').className='buttonDisabled';
    }
}

function showPreviousPage(){
    if(showingPage >1){
		showPageNumber(showingPage-1);	 
		document.getElementById('lastButton').className='button';
		document.getElementById('nextButton').className='button';
	}
	if(showingPage==1){
    	document.getElementById('firstButton').className='buttonDisabled'; 
		document.getElementById('previousButton').className='buttonDisabled'; 
	}
}

function viewPhoto(photoName, displayName){
	//alert(photoName);
    document.getElementById('photo_'+showingPhoto).className = 'hide';
    document.getElementById('photo_'+photoName).className='show';
	showingPhoto=photoName; 
	if(displayName){
		document.getElementById('currentPhotoName').childNodes[0].nodeValue = displayName;
	}else{
		document.getElementById('currentPhotoName').childNodes[0].nodeValue = photoName;
	}
}


