using Kanban.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Kanban.Controllers
{
    public class KanbanController : Controller
    {
        private readonly IKanbanService _kanbanService;
        public KanbanController(IKanbanService kanbanService)
        {
            _kanbanService = kanbanService;
        }
        public IActionResult Index()
        {
            return View();
        }
        [Authorize]
        public async Task<IActionResult> GetBoards()
        {
            var userId = User.GetUserId();
            var r = await _kanbanService.GetBoards(userId);
            if (!r.Success)
            {
                return Ok(new ApiResponse { Success = false, ErrorMessage = r.ErrorMessage });
            }
            return Ok();
            //return Ok(new ApiResponse { Success = true, r.Data.Select(x => new { id = x.Id, isOwner = x.UserId == userId }) });
        }
    }
}
